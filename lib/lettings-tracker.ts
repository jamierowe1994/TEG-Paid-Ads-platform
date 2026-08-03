// Real stage tracking for lettings referrals.
//
// A lettings referral is a LANDLORD, so the journey starts before there's a
// tenant at all and spans two systems:
//
//   Appointment booked → Rex, a market appraisal exists with a date
//   On market          → Rex, a listing exists for their property
//   Tenant found       → Rex, let_agreed (or a let/leased listing state)
//   Tenant referencing → Propoly, referencing        ← not wired yet
//   Moved in           → Propoly, move_day           ← not wired yet
//
// Everything joins on the LANDLORD'S EMAIL, which is the same key Propoly's
// `landlord_details.email` gives us (100% populated there).
//
// How the landlord is found in Rex is not obvious: there is no landlord field
// on an appraisal or a listing. Rex models it as a *relationship record* —
// `contact_reln_property` (reln_type "owner") and `contact_reln_listing`
// (the account's types are "Landlord" and "Landlord's Representative"). So we
// go contact-first: email → contact → their listings and properties.
//
// Two Rex behaviours worth knowing before changing anything here:
//   · Contacts/search only ever returns system_record_state = "active". A
//     landlord archived in Rex will not be found, and that is correct — we
//     should not claim progress on a record the lettings team has retired.
//   · The listing embedded in a contact's relationship row is a THIN
//     projection (id, agents, category, location, property) — it carries no
//     state at all, which is why each listing is read individually below.

import { rexConfigured, rexCriterion, rexReadRecord, rexSearchRows } from "@/lib/rex";

/** What we can say about a lettings referral's real-world progress. */
export interface LettingsProgress {
  appointmentBooked: boolean;
  onMarket: boolean;
  tenantFound: boolean;
  /** Propoly-sourced; always false until that feed is wired. */
  referencing: boolean;
  movedIn: boolean;
  /** False when we looked but found no matching landlord in Rex. */
  matched: boolean;
  checkedAt: string;
}

/** Nothing known — the honest default, and what every failure returns to. */
export function unknownProgress(): LettingsProgress {
  return {
    appointmentBooked: false,
    onMarket: false,
    tenantFound: false,
    referencing: false,
    movedIn: false,
    matched: false,
    checkedAt: new Date().toISOString(),
  };
}

// Listing states that mean a tenant is committed rather than merely sought.
// `let_agreed` is the primary signal; these back it up for listings that moved
// straight to a terminal state without the flag being set.
// TODO(rex-states): confirmed against sale listings only so far — check the
// exact lettings vocabulary on a live let before relying on these alone.
const LET_STATES = new Set(["leased", "let", "let_agreed", "rented"]);

function asArray(v: unknown): Record<string, unknown>[] {
  if (Array.isArray(v)) return v as Record<string, unknown>[];
  if (v && typeof v === "object") return Object.values(v) as Record<string, unknown>[];
  return [];
}

/** Rex returns enums as either a bare string or `{ id, text }`. */
function enumId(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") {
    const id = (v as { id?: unknown }).id;
    if (typeof id === "string") return id;
  }
  return null;
}

function idOf(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string" || typeof v === "number") return String(v);
  const id = (v as { id?: unknown }).id;
  return id == null ? null : String(id);
}

/**
 * Resolve the three Rex-sourced stages for one landlord.
 *
 * Throws if Rex is unreachable — the caller decides how to present that. It
 * must NOT be collapsed into "no progress", which would show a landlord who is
 * already let as though nothing had happened.
 */
export async function lettingsProgressForLandlord(
  email: string,
  brandId = "lettings"
): Promise<LettingsProgress> {
  const out = unknownProgress();
  const clean = email.trim().toLowerCase();
  if (!clean || !rexConfigured()) return out;

  // 1. Landlord email → contact.
  const contacts = await rexSearchRows(
    "Contacts",
    { criteria: [rexCriterion("contact.email_address", clean)], limit: 1 },
    brandId
  );
  const contactId = idOf(contacts[0]?.id);
  if (!contactId) return out;
  out.matched = true;

  // 2. Contact → the listings and properties they're attached to.
  const contact = await rexReadRecord("Contacts", contactId, brandId);
  const related = (contact?.related ?? {}) as Record<string, unknown>;
  const listingRelns = asArray(related.contact_reln_listing);
  const propertyRelns = asArray(related.contact_reln_property);

  const listingIds = new Set<string>();
  const propertyIds = new Set<string>();
  for (const r of listingRelns) {
    const listing = r.listing as Record<string, unknown> | undefined;
    const lid = idOf(listing?.id);
    if (lid) listingIds.add(lid);
    // A listing's property is in the thin projection, so we get it for free.
    const pid = idOf(listing?.property);
    if (pid) propertyIds.add(pid);
  }
  for (const r of propertyRelns) {
    const pid = idOf(r.property);
    if (pid) propertyIds.add(pid);
  }

  // 3. On market / tenant found — needs a full read per listing, because the
  //    relationship projection carries no state.
  for (const id of listingIds) {
    const listing = await rexReadRecord("Listings", id, brandId);
    if (!listing) continue;
    const state = enumId(listing.system_listing_state);
    // Any listing at all means the property reached the market.
    if (state) out.onMarket = true;
    if (listing.let_agreed) out.tenantFound = true;
    if (state && LET_STATES.has(state)) out.tenantFound = true;
  }

  // 4. Appointment booked — an appraisal against the property with a real date.
  //    An appraisal row with a null date is a placeholder, not a booking.
  for (const pid of propertyIds) {
    const appraisals = await rexSearchRows(
      "Appraisals",
      { criteria: [rexCriterion("property_id", pid)], limit: 20 },
      brandId
    );
    if (appraisals.some((a) => a.appraisal_date)) {
      out.appointmentBooked = true;
      break;
    }
  }

  // A property that's on the market was necessarily appraised first, even if
  // the appraisal record was archived or never dated. Implying it backwards is
  // safe; implying anything forwards would not be.
  if (out.onMarket) out.appointmentBooked = true;
  if (out.tenantFound) out.onMarket = true;

  return out;
}
