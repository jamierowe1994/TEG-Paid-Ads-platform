import "server-only";
import type { Lead } from "./types";

// Atlas is The Recruitment Experts' CRM (recruitwithatlas.com). This client
// pushes a portal lead into Atlas as a person, then attaches its note to that
// person's timeline. One button in the leads funnel calls pushLeadToAtlas().
//
// Config via env (secret — lives in Railway, never in the repo):
//   ATLAS_API_KEY        — the agency API key (Bearer token). Required.
//   ATLAS_API_URL        — base URL, defaults to https://api.recruitwithatlas.com
//   ATLAS_FALLBACK_EMAIL — Atlas user pushes are attributed to when the
//                          recruiter's own email isn't an Atlas user yet.
//
// Attribution: we try to attribute the push to the signed-in recruiter's
// email so it lands in *their* name in Atlas. If that email isn't a user in
// the agency (Atlas answers 404), we retry as the fallback so the push still
// succeeds rather than failing outright.

const BASE = process.env.ATLAS_API_URL ?? "https://api.recruitwithatlas.com";
const FALLBACK_EMAIL =
  process.env.ATLAS_FALLBACK_EMAIL ?? "james@therecruitmentexperts.co.uk";

export function atlasConfigured(): boolean {
  return !!process.env.ATLAS_API_KEY;
}

interface AtlasResponse {
  status: number;
  ok: boolean;
  data: Record<string, unknown>;
}

async function atlas(
  path: string,
  method: "GET" | "POST" | "PUT",
  body?: unknown
): Promise<AtlasResponse> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.ATLAS_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    /* empty/non-JSON body */
  }
  return { status: res.status, ok: res.ok, data };
}

function atlasError(res: AtlasResponse): string {
  return (
    (res.data?.error as string) ||
    (res.data?.message as string) ||
    `Atlas request failed (${res.status})`
  );
}

// Atlas wants firstName / lastName. Split on the first space; a single token
// becomes the first name with no last name.
function splitName(full: string): { firstName: string | null; lastName: string | null } {
  const trimmed = (full ?? "").trim();
  if (!trimmed) return { firstName: null, lastName: null };
  const i = trimmed.indexOf(" ");
  if (i === -1) return { firstName: trimmed, lastName: null };
  return { firstName: trimmed.slice(0, i), lastName: trimmed.slice(i + 1) };
}

export interface AtlasPushResult {
  personId: string;
  alreadyExisted: boolean; // Atlas already had this contact (deduped)
  noteAttached: boolean;
  attributedTo: string; // the email the push was recorded under
}

// Push one lead into Atlas: create the person, then attach its note.
export async function pushLeadToAtlas(
  lead: Lead,
  recruiterEmail: string
): Promise<AtlasPushResult> {
  if (!atlasConfigured()) {
    throw new Error("Atlas isn't connected yet (missing ATLAS_API_KEY).");
  }

  // At least one non-website identity is required for Atlas to store — and
  // dedupe — the person.
  const identities: Array<{ type: string; value: string; isPrimary?: boolean }> = [];
  if (lead.email?.trim()) {
    identities.push({ type: "email", value: lead.email.trim(), isPrimary: true });
  }
  if (lead.phone?.trim()) {
    identities.push({ type: "phone", value: lead.phone.trim() });
  }
  if (identities.length === 0) {
    throw new Error(
      "This lead has no email or phone, so Atlas can't create a contact for them."
    );
  }

  const { firstName, lastName } = splitName(lead.name);
  const person = (addedByEmail: string) => ({
    firstName,
    lastName,
    addedByEmail,
    identities,
    // externalId ties this Atlas person back to the portal lead, so pushing
    // the same lead twice is deduped by Atlas instead of duplicated.
    source: { system: "experts-portal", externalId: lead.id },
  });

  // Create the person, attributing to the recruiter, falling back on a 404
  // (their email isn't an Atlas user).
  let attributedTo = recruiterEmail || FALLBACK_EMAIL;
  let res = await atlas("/api/v1/people", "POST", person(attributedTo));
  if (res.status === 404 && attributedTo !== FALLBACK_EMAIL) {
    attributedTo = FALLBACK_EMAIL;
    res = await atlas("/api/v1/people", "POST", person(attributedTo));
  }

  let personId: string | undefined;
  let alreadyExisted = false;
  if (res.status === 201) {
    personId = (res.data?.data as Record<string, unknown> | undefined)?.personId as
      | string
      | undefined;
  } else if (res.status === 409) {
    // Atlas already has this contact — 409 returns the existing personId.
    personId = res.data?.personId as string | undefined;
    alreadyExisted = true;
  } else {
    throw new Error(atlasError(res));
  }
  if (!personId) throw new Error("Atlas didn't return a contact id.");

  // Attach the note (if any) to that person's timeline.
  let noteAttached = false;
  const note = lead.note?.trim();
  if (note) {
    let n = await atlas("/api/v1/people/notes", "PUT", {
      personId,
      note,
      ownerEmail: attributedTo,
    });
    if (n.status === 404 && attributedTo !== FALLBACK_EMAIL) {
      n = await atlas("/api/v1/people/notes", "PUT", {
        personId,
        note,
        ownerEmail: FALLBACK_EMAIL,
      });
    }
    noteAttached = n.status === 201;
  }

  return { personId, alreadyExisted, noteAttached, attributedTo };
}
