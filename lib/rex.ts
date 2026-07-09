import "server-only";
import type { Lead } from "./types";

// Rex is the property brands' CRM (rexsoftware.com) — used by The Property
// Experts, The Lettings Experts, Fine & Country and The Auction Company
// (their `crmName` is "REP"). This client pushes a converted portal lead into
// Rex: it finds-or-creates the Contact (person), then creates a Lead record
// referencing that contact, with the agent's note attached. One button in the
// leads funnel calls pushLeadToRex(). Mirrors lib/atlas.ts.
//
// Rex API shape (see api-docs.rexsoftware.com):
//   • Every call is POST {BASE}/v1/rex/{Service}/{method}, JSON body.
//   • Auth: POST /v1/rex/Authentication/login { email, password, account_id? }
//     returns a token (GUID). Send it as `Authorization: Bearer <token>` on
//     every other call. Missing/expired → a TokenException error.
//   • Tokens last ~1h of activity; we request a longer token_lifetime and
//     cache one token per account, re-logging in on expiry / TokenException.
//   • Responses are a { result, error } envelope.
//
// Config via env (secret — lives in Railway, never in the repo):
//   REX_API_EMAIL / REX_API_PASSWORD — the Rex user login (a dedicated API
//                                      user on the account). Required.
//   REX_API_BASE      — base URL. Defaults to the UK host.
//   REX_ACCOUNT_ID    — default Rex account id to log into (e.g. 4893).
//   REX_ACCOUNT_<BRAND> — per-brand account id override, e.g.
//                         REX_ACCOUNT_PROPERTY, REX_ACCOUNT_LETTINGS.
//   REX_LEAD_SOURCE_ID    — the lead_source id these leads are stamped with
//                           (create a "Experts Portal — Paid Ads" source in
//                           Rex and put its id here). Optional.
//   REX_DEFAULT_ASSIGNEE_ID — Rex user id to assign leads to when we can't map
//                             the agent to a Rex user. Optional.
//
// TODO(rex-demo): several specifics are confirmed against the demo account on
// first connect (exact contacts/create field names, the search response shape,
// valid lead_source / lead_type ids). Points that need that verification are
// marked `TODO(rex-demo)` below.

const BASE = process.env.REX_API_BASE ?? "https://api.uk.rexsoftware.com";

// Requested token lifetime in seconds. Rex resets it ~every 30th request, so a
// few hours comfortably covers a burst of pushes without re-authenticating.
const TOKEN_LIFETIME = 4 * 60 * 60; // 4 hours
// Refresh a little before the server-side expiry to avoid racing a TokenException.
const TOKEN_SKEW_MS = 5 * 60 * 1000; // 5 minutes

export function rexConfigured(): boolean {
  return !!(process.env.REX_API_EMAIL && process.env.REX_API_PASSWORD);
}

// Resolve the Rex account id for a brand: a per-brand override wins, else the
// shared default. Returned as a string; Rex accepts numeric-or-string ids.
export function rexAccountForBrand(brandId: string): string | null {
  const perBrand = process.env[`REX_ACCOUNT_${brandId.toUpperCase()}`];
  return perBrand || process.env.REX_ACCOUNT_ID || null;
}

interface RexResponse {
  status: number;
  ok: boolean; // HTTP ok AND no `error` in the envelope
  result: unknown;
  error: string | null;
}

// One token per account id (a single Rex user can access multiple accounts).
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

function accountKey(accountId: string | null): string {
  return accountId ?? "__default__";
}

function isTokenError(res: RexResponse): boolean {
  const e = (res.error ?? "").toLowerCase();
  return res.status === 401 || e.includes("token") || e.includes("authenticate");
}

// Raw POST to a Rex service/method. Does NOT attach a token — used for login
// and (via rexCall) for authenticated calls once a token is resolved.
async function rexPost(
  path: string,
  body: unknown,
  token?: string
): Promise<RexResponse> {
  const res = await fetch(`${BASE}/v1/rex/${path}`, {
    method: "POST", // Rex only accepts POST
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body ?? {}),
    cache: "no-store",
  });
  let data: { result?: unknown; error?: unknown } = {};
  try {
    data = (await res.json()) as { result?: unknown; error?: unknown };
  } catch {
    /* empty/non-JSON body */
  }
  const error =
    typeof data?.error === "string"
      ? data.error
      : data?.error
        ? JSON.stringify(data.error)
        : null;
  return { status: res.status, ok: res.ok && !error, result: data?.result, error };
}

// Log into a Rex account and return a fresh token.
async function login(accountId: string | null): Promise<string> {
  const payload: Record<string, unknown> = {
    email: process.env.REX_API_EMAIL,
    password: process.env.REX_API_PASSWORD,
    token_lifetime: TOKEN_LIFETIME,
  };
  if (accountId) payload.account_id = accountId;
  const res = await rexPost("Authentication/login", payload);
  // Login returns the token as the `result` (a GUID string); some deployments
  // wrap it as { result: { token } } — accept either.
  const token =
    typeof res.result === "string"
      ? res.result
      : ((res.result as { token?: string } | undefined)?.token ?? null);
  if (!res.ok || !token) {
    throw new Error(res.error ?? `Rex login failed (${res.status})`);
  }
  tokenCache.set(accountKey(accountId), {
    token,
    expiresAt: Date.now() + TOKEN_LIFETIME * 1000 - TOKEN_SKEW_MS,
  });
  return token;
}

async function getToken(accountId: string | null, force = false): Promise<string> {
  const key = accountKey(accountId);
  const cached = tokenCache.get(key);
  if (!force && cached && cached.expiresAt > Date.now()) return cached.token;
  return login(accountId);
}

// Authenticated call: resolve a token, POST, and retry once with a fresh token
// if Rex rejects it (expired / invalidated between our cache and the request).
async function rexCall(
  path: string,
  body: unknown,
  accountId: string | null
): Promise<RexResponse> {
  if (!rexConfigured()) {
    throw new Error("Rex isn't connected yet (missing REX_API_EMAIL/PASSWORD).");
  }
  let token = await getToken(accountId);
  let res = await rexPost(path, body, token);
  if (isTokenError(res)) {
    token = await getToken(accountId, true); // force re-login
    res = await rexPost(path, body, token);
  }
  return res;
}

// Asks Rex itself what fields a model accepts (e.g. "Contacts", "Leads") —
// ground truth instead of guessing field names against the live account.
export async function rexDescribeModel(
  model: string,
  brandId: string
): Promise<unknown> {
  const accountId = rexAccountForBrand(brandId);
  const res = await rexCall(`${model}/describeModel`, {}, accountId);
  if (!res.ok) {
    throw new Error(res.error ?? `Rex describeModel(${model}) failed`);
  }
  return res.result;
}

// Direct API search for contacts by name — bypasses whatever the Rex web
// UI's search box does under the hood, so we can confirm ground truth on
// whether a pushed contact actually exists and what it actually contains.
export async function rexSearchContactsByName(
  name: string,
  brandId: string
): Promise<unknown> {
  const accountId = rexAccountForBrand(brandId);
  const res = await rexCall(
    "Contacts/search",
    {
      criteria: [["contact.name_full", "~", name]],
      limit: 10,
      // Confirmed via Rex's own "invalid argument" error: extra fields must
      // be nested under extra_options, not passed as a top-level arg.
      extra_options: {
        extra_fields: [
          "related.contact_names",
          "related.contact_emails",
          "related.contact_phones",
        ],
      },
    },
    accountId
  );
  if (!res.ok) throw new Error(res.error ?? "Rex search failed");
  return res.result;
}

// Most recently created contacts (no name filter) — useful when a name
// search comes back empty, to see what Rex actually has regardless of
// whether our guess at the search field/operator was right.
export async function rexRecentContacts(brandId: string): Promise<unknown> {
  const accountId = rexAccountForBrand(brandId);
  const res = await rexCall(
    "Contacts/search",
    {
      criteria: [],
      limit: 10,
      // Confirmed via Rex's own "invalid argument" error: order_by is a
      // plain { field_name: direction } object, not an array of pairs.
      order_by: { system_ctime: "desc" },
      extra_options: {
        extra_fields: [
          "related.contact_names",
          "related.contact_emails",
          "related.contact_phones",
        ],
      },
    },
    accountId
  );
  if (!res.ok) throw new Error(res.error ?? "Rex recent-contacts search failed");
  return res.result;
}

// ── Contacts ──────────────────────────────────────────────────────────────

// Split a full name into Rex's first/last. Rex contacts also expose a single
// `name`, but create appears to want the parts — we send both to be safe.
function splitName(full: string): { first: string; last: string | null } {
  const t = (full ?? "").trim();
  if (!t) return { first: "", last: null };
  const i = t.indexOf(" ");
  return i === -1
    ? { first: t, last: null }
    : { first: t.slice(0, i), last: t.slice(i + 1) };
}

// Confirmed via Contacts/describeModel against the demo account: a Contact's
// top-level record has no name/email/phone fields at all — those live in
// related sub-records (contact_names / contact_emails / contact_phones), each
// searchable as `contact.name_first` etc. Search + create both need the
// relational shape below, not flat fields.

// Find a contact by email, returning its id if one exists. Rex search takes a
// `criteria` array of [field, op, value] — the field is the dotted
// `contact.email_address` search alias, not a bare column.
async function findContactIdByEmail(
  email: string,
  accountId: string | null
): Promise<string | null> {
  const res = await rexCall(
    "Contacts/search",
    { criteria: [["contact.email_address", "=", email]], limit: 1 },
    accountId
  );
  if (!res.ok) return null;
  const rows = Array.isArray(res.result)
    ? (res.result as Array<{ id?: string | number }>)
    : (((res.result as { rows?: Array<{ id?: string | number }> })?.rows) ?? []);
  const id = rows[0]?.id;
  return id != null ? String(id) : null;
}

// Create a contact and return its id. `type: "person"` plus a
// `related.contact_names` entry is what satisfies Rex's "cannot be saved
// without a name" validation — confirmed against the demo account.
// TODO(rex-demo): "person" is the conventional Rex contact_type value but
// hasn't been confirmed against this account's actual enum list yet; if Rex
// rejects it, check contact.type's option list via describeModel.
async function createContact(
  lead: Lead,
  accountId: string | null,
  ownerRexUserId?: string | null
): Promise<string> {
  const { first, last } = splitName(lead.name);
  const related: Record<string, unknown> = {
    contact_names: [
      { name_first: first || lead.name.trim(), name_last: last ?? "", is_primary: true },
    ],
  };
  if (lead.email?.trim()) {
    related.contact_emails = [{ email_address: lead.email.trim(), is_primary: true }];
  }
  if (lead.phone?.trim()) {
    related.contact_phones = [{ phone_number: lead.phone.trim(), is_primary: true }];
  }
  const data: Record<string, unknown> = { type: "person", related };
  // Make the record OWNED by the pushing agent's Rex user (rather than the
  // shared API login). system_owner_user_id is a real column per describeModel.
  if (ownerRexUserId) data.system_owner_user_id = ownerRexUserId;

  const res = await rexCall("Contacts/create", { data, return_id: true }, accountId);
  if (!res.ok) throw new Error(res.error ?? "Rex contact create failed");
  // return_id:true → result is the id (or an { id } object).
  const id =
    typeof res.result === "string" || typeof res.result === "number"
      ? String(res.result)
      : ((res.result as { id?: string | number } | undefined)?.id ?? null);
  if (id == null) throw new Error("Rex didn't return a contact id.");
  return String(id);
}

async function findOrCreateContact(
  lead: Lead,
  accountId: string | null,
  ownerRexUserId?: string | null
): Promise<{ id: string; alreadyExisted: boolean }> {
  if (!lead.email?.trim() && !lead.phone?.trim()) {
    throw new Error(
      "This lead has no email or phone, so Rex can't create a contact for them."
    );
  }
  if (lead.email?.trim()) {
    const existing = await findContactIdByEmail(lead.email.trim(), accountId);
    if (existing) return { id: existing, alreadyExisted: true };
  }
  return {
    id: await createContact(lead, accountId, ownerRexUserId),
    alreadyExisted: false,
  };
}

// The users on a brand's Rex account (id + name/email) — how the admin finds
// each agent's Rex user id to store against their portal profile, so pushed
// leads land owned by the right person. TODO(rex-demo): "AccountUsers" is the
// expected service name; if Rex rejects it, its error will name the valid one.
export async function rexListUsers(brandId: string): Promise<unknown> {
  const accountId = rexAccountForBrand(brandId);
  const res = await rexCall("AccountUsers/search", { limit: 100 }, accountId);
  if (!res.ok) throw new Error(res.error ?? "Rex user list failed");
  return res.result;
}

// ── Health check (admin Connections tab) ────────────────────────────────────

// Proves the login works and reports the accounts this user can reach — a
// cheap read the admin panel (and /api/health?rex=1) uses to show connection
// status. Login to getAccessibleAccounts doesn't require an account_id, so
// this works even before REX_ACCOUNT_ID is set — the returned list is how you
// find that id in the first place, no digging through the Rex UI needed.
export async function rexPing(): Promise<{
  configured: boolean;
  ok: boolean;
  accounts?: Array<{ id: string; name: string | null }>;
  error?: string;
}> {
  if (!rexConfigured()) return { configured: false, ok: false };
  try {
    const res = await rexCall("UserProfile/getAccessibleAccounts", {}, null);
    if (!res.ok) return { configured: true, ok: false, error: res.error ?? "failed" };
    const raw = Array.isArray(res.result) ? res.result : [];
    const accounts = raw.map((a) => {
      const row = a as Record<string, unknown>;
      const id = row.id ?? row.account_id ?? row.value;
      const name =
        (row.name as string) ??
        (row.account_name as string) ??
        (row.title as string) ??
        (row.label as string) ??
        null;
      return { id: String(id), name };
    });
    return { configured: true, ok: true, accounts };
  } catch (e) {
    return {
      configured: true,
      ok: false,
      error: e instanceof Error ? e.message : "Rex unreachable",
    };
  }
}

// ── Push a lead ─────────────────────────────────────────────────────────────

export interface RexPushResult {
  leadId: string;
  contactId: string;
  contactAlreadyExisted: boolean;
}

// Push one portal lead into Rex: find-or-create the contact, then create a
// lead referencing it, with the note. `opts.leadType` lets property vs auction
// pick the right Rex lead_type; `opts.agentRexUserId` is the pushing agent's
// own Rex user, so the contact + lead land owned/assigned to THEM instead of
// the shared API login.
export async function pushLeadToRex(
  lead: Lead,
  brandId: string,
  opts?: { leadType?: string; agentRexUserId?: string | null }
): Promise<RexPushResult> {
  if (!rexConfigured()) {
    throw new Error("Rex isn't connected yet (missing REX_API_EMAIL/PASSWORD).");
  }
  const accountId = rexAccountForBrand(brandId);
  const leadType = opts?.leadType ?? "appraisal_request";
  const agentRexUserId = opts?.agentRexUserId ?? null;

  const contact = await findOrCreateContact(lead, accountId, agentRexUserId);

  // Build the lead. Sub-records are linked by id. lead_source / assignee are
  // optional here — only sent when configured. TODO(rex-demo): confirm which
  // of these Rex treats as required for a valid lead.
  const data: Record<string, unknown> = {
    contact: { id: contact.id },
    note: lead.note?.trim() || "Lead pushed from the Experts portal.",
    lead_type: { id: leadType },
  };
  const sourceId = process.env.REX_LEAD_SOURCE_ID;
  if (sourceId) data.lead_source = { id: sourceId };
  // The agent's own Rex user wins; REX_DEFAULT_ASSIGNEE_ID is the fallback.
  const assigneeId = agentRexUserId || process.env.REX_DEFAULT_ASSIGNEE_ID;
  if (assigneeId) data.assignee = { id: assigneeId };

  const res = await rexCall("Leads/create", { data, return_id: true }, accountId);
  if (!res.ok) throw new Error(res.error ?? "Rex lead create failed");
  const leadId =
    typeof res.result === "string" || typeof res.result === "number"
      ? String(res.result)
      : ((res.result as { id?: string | number } | undefined)?.id ?? null);
  if (leadId == null) throw new Error("Rex didn't return a lead id.");

  return {
    leadId: String(leadId),
    contactId: contact.id,
    contactAlreadyExisted: contact.alreadyExisted,
  };
}
