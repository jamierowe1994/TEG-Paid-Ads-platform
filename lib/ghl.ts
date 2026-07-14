import "server-only";
import type { Lead } from "./types";

// GoHighLevel (LeadConnector) CRM client — the v2 API. Pushes a portal lead in
// as a contact (upsert, so re-pushing the same person dedupes rather than
// duplicates), then attaches its note. Mirrors the Atlas/Rex clients: one
// button in the leads funnel calls pushLeadToGhl().
//
// Config via env (secret — lives in Railway, never in the repo):
//   GHL_API_TOKEN    — a Private Integration Token for the sub-account (or an
//                      OAuth access token). Sent as a Bearer token. Required.
//   GHL_LOCATION_ID  — the GoHighLevel location (sub-account) id. Required.
//   GHL_API_VERSION  — API version header, defaults to 2021-07-28.

const BASE = "https://services.leadconnectorhq.com";
const VERSION = process.env.GHL_API_VERSION ?? "2021-07-28";

// Credentials resolve per-brand first, then fall back to a single group-wide
// pair — so you can run ONE GoHighLevel account for everyone (just set
// GHL_API_TOKEN + GHL_LOCATION_ID) OR a separate sub-account per brand (set
// GHL_TOKEN_<BRAND> + GHL_LOCATION_<BRAND>, e.g. GHL_TOKEN_MORTGAGE /
// GHL_LOCATION_MORTGAGE). No code change either way.
function ghlToken(brandId?: string): string | undefined {
  const perBrand =
    brandId && process.env[`GHL_TOKEN_${brandId.toUpperCase()}`];
  return (perBrand || process.env.GHL_API_TOKEN) ?? undefined;
}
function ghlLocationId(brandId?: string): string {
  const perBrand =
    brandId && process.env[`GHL_LOCATION_${brandId.toUpperCase()}`];
  return (perBrand || process.env.GHL_LOCATION_ID) ?? "";
}
export function ghlConfigured(brandId?: string): boolean {
  return !!ghlToken(brandId) && !!ghlLocationId(brandId);
}

interface GhlResponse {
  status: number;
  ok: boolean;
  data: Record<string, unknown>;
}

async function ghl(
  path: string,
  method: "GET" | "POST" | "PUT",
  body?: unknown,
  brandId?: string
): Promise<GhlResponse> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${ghlToken(brandId)}`,
      Version: VERSION,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    /* empty / non-JSON body */
  }
  return { status: res.status, ok: res.ok, data };
}

function ghlError(res: GhlResponse): string {
  const msg = res.data?.message;
  return (
    (typeof msg === "string" ? msg : Array.isArray(msg) ? msg.join(", ") : "") ||
    (res.data?.error as string) ||
    `GoHighLevel request failed (${res.status})`
  );
}

function splitName(full: string): { firstName: string | null; lastName: string | null } {
  const trimmed = (full ?? "").trim();
  if (!trimmed) return { firstName: null, lastName: null };
  const i = trimmed.indexOf(" ");
  if (i === -1) return { firstName: trimmed, lastName: null };
  return { firstName: trimmed.slice(0, i), lastName: trimmed.slice(i + 1) };
}

// Health check for the admin Connections tab — a cheap read that proves the
// token + location are valid and GHL is reachable. Deliberately a contacts
// read rather than /locations/{id}: it keeps the Private Integration down to
// the contacts scopes we genuinely need, instead of also demanding
// locations.readonly just to answer "are we connected?".
export async function ghlPing(brandId?: string): Promise<{
  configured: boolean;
  ok: boolean;
  error?: string;
}> {
  if (!ghlConfigured(brandId)) return { configured: false, ok: false };
  try {
    const res = await ghl(
      `/contacts/?locationId=${encodeURIComponent(ghlLocationId(brandId))}&limit=1`,
      "GET",
      undefined,
      brandId
    );
    if (!res.ok) return { configured: true, ok: false, error: ghlError(res) };
    return { configured: true, ok: true };
  } catch (e) {
    return {
      configured: true,
      ok: false,
      error: e instanceof Error ? e.message : "GoHighLevel unreachable",
    };
  }
}

// Read-only duplicate check: is this person already in the location? Uses the
// dedicated duplicate-search endpoint. Best-effort: null = couldn't check,
// false = definitively not there.
export async function ghlFindContact(
  email: string,
  phone: string,
  brandId?: string
): Promise<{ id: string | null; matchedBy: "email" | "phone" } | false | null> {
  if (!ghlConfigured(brandId)) return null;
  const tryQuery = async (
    param: "email" | "number",
    value: string,
    matchedBy: "email" | "phone"
  ): Promise<{ id: string | null; matchedBy: "email" | "phone" } | false | null> => {
    try {
      const res = await ghl(
        `/contacts/search/duplicate?locationId=${encodeURIComponent(
          ghlLocationId(brandId)
        )}&${param}=${encodeURIComponent(value)}`,
        "GET",
        undefined,
        brandId
      );
      if (!res.ok) return null; // unsupported / error — unknown
      const contact = res.data?.contact as Record<string, unknown> | undefined;
      if (!contact) return false; // definitively not found
      const id = (contact.id as string) ?? null;
      return { id, matchedBy };
    } catch {
      return null;
    }
  };
  let sawDefinitiveMiss = false;
  if (email.trim()) {
    const r = await tryQuery("email", email.trim(), "email");
    if (r) return r;
    if (r === false) sawDefinitiveMiss = true;
  }
  if (phone.trim()) {
    const r = await tryQuery("number", phone.trim(), "phone");
    if (r) return r;
    if (r === false) sawDefinitiveMiss = true;
  }
  return sawDefinitiveMiss ? false : null;
}

export interface GhlPushResult {
  contactId: string;
  alreadyExisted: boolean; // GHL already had this contact (upsert deduped)
  noteAttached: boolean;
}

// Add a lead into GoHighLevel: upsert the contact (with tags that a nurture
// workflow can trigger on), then attach its note. This is the ONLY way leads
// reach GHL — used when a lost lead is dropped into the marketing/nurture
// funnel, never for the normal CRM push.
export async function pushLeadToGhl(
  lead: Lead,
  tags: string[] = [],
  brandId?: string
): Promise<GhlPushResult> {
  if (!ghlConfigured(brandId)) {
    throw new Error(
      "GoHighLevel isn't connected yet (missing GHL_API_TOKEN / GHL_LOCATION_ID)."
    );
  }
  if (!lead.email?.trim() && !lead.phone?.trim()) {
    throw new Error(
      "This lead has no email or phone, so GoHighLevel can't create a contact for them."
    );
  }

  const { firstName, lastName } = splitName(lead.name);
  // Upsert dedupes on email/phone within the location, so re-pushing the same
  // lead updates rather than duplicates.
  const res = await ghl(
    "/contacts/upsert",
    "POST",
    {
      locationId: ghlLocationId(brandId),
      firstName,
      lastName,
      name: lead.name?.trim() || undefined,
      email: lead.email?.trim() || undefined,
      phone: lead.phone?.trim() || undefined,
      tags: tags.length ? tags : undefined,
      source: "The Experts Group portal",
    },
    brandId
  );
  if (!res.ok) throw new Error(ghlError(res));

  const contact = res.data?.contact as Record<string, unknown> | undefined;
  const contactId = (contact?.id as string) ?? undefined;
  if (!contactId) throw new Error("GoHighLevel didn't return a contact id.");
  // `new: false` on the upsert means the contact already existed.
  const alreadyExisted = res.data?.new === false;

  // Attach the note (if any) to the contact.
  let noteAttached = false;
  const note = lead.note?.trim();
  if (note) {
    const n = await ghl(
      `/contacts/${contactId}/notes`,
      "POST",
      { body: note },
      brandId
    );
    noteAttached = n.ok;
  }

  return { contactId, alreadyExisted, noteAttached };
}
