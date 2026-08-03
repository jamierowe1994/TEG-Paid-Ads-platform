// Real stage tracking for referrals.
//
// A referral is the PROPERTY OWNER — a landlord for lettings, a vendor for
// sales — so the journey starts before there's a tenant or buyer at all.
//
// THE TWO BUSINESSES USE DIFFERENT SYSTEMS, and this is the thing to
// understand before changing anything here:
//
// Lettings (The Lettings Experts) → PROPOLY, entirely.
//   Tenant found       → a deal exists and isn't cancelled
//   Tenant referencing → the deal reached `references` or beyond
//   Moved in           → the deal reached `complete`
//   Didn't proceed     → every deal for that landlord was cancelled
//
// Sales (The Property Experts) → REX, entirely.
//   Appointment set    → an appraisal with a date
//   Property listed    → a listing exists
//   Sold STC           → under_contract, or the state reaching "sold"
//   Exchanged          → contract_status (see the note by the constant)
//
// Lettings deliberately does NOT read Rex any more. It used to, and it was
// wrong: TLE has folded into TPE and they share Rex account 3517, which holds
// only sale stock (360 listings sampled, all `residential_sale`). So a lettings
// referral was reading its landlord's SALE listing and lighting up "on market"
// and even "tenant found" from it. Sourcing lettings from Propoly removes that
// whole class of false positive.
//
// The cost of that decision, stated plainly: Propoly knows nothing before a
// tenant is found — its `properties` endpoint is an address book with no status
// and no marketing dates. So for lettings, "appointment booked" and "on market"
// have NO source in either system and are only ever implied backwards once a
// deal exists. A landlord who has been appraised but has no tenant yet shows no
// progress. That is a gap, not a bug: it reports less than we'd like rather
// than reporting something untrue.
//
// "Paid" is our own referral status on both, and needs nothing from either CRM.
//
// Everything joins on the OWNER'S EMAIL — Propoly's `landlord_details[].email`
// (861 of 861 populated) and Rex's `contact.email_address`.
//
// How the owner is found in Rex is not obvious: there is no landlord or vendor
// field on an appraisal or a listing. Rex models it as a *relationship record* —
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
import { propolyConfigured, tenancyProgressFor } from "@/lib/propoly";

/** Brands whose pipeline comes from Propoly rather than Rex. */
const PROPOLY_BRANDS = new Set(["lettings"]);

/**
 * What we can say about a referral's real-world progress.
 *
 * One shape covers both businesses because they share a spine in Rex — the
 * contact, their property, its appraisal and its listing. Only the later
 * stages diverge, so lettings reads the tenancy fields and sales reads the
 * contract ones. A flag a brand doesn't use simply stays false.
 */
export interface ReferralProgress {
  // Shared: both journeys start with an appraisal and a listing. For lettings
  // these are only ever implied backwards from a Propoly deal — see the note
  // at the top of this file.
  appointmentBooked: boolean;
  onMarket: boolean;
  // Lettings (The Lettings Experts) — from Propoly.
  tenantFound: boolean;
  referencing: boolean;
  movedIn: boolean;
  /** Lettings: every deal for this landlord was cancelled. */
  didNotProceed: boolean;
  // Sales (The Property Experts) — from Rex.
  soldStc: boolean;
  exchanged: boolean;
  /** False when we looked but found nobody — distinct from "nothing happened". */
  matched: boolean;
  checkedAt: string;
}

/** @deprecated Use ReferralProgress — kept so existing imports keep working. */
export type LettingsProgress = ReferralProgress;

/** Nothing known — the honest default, and what every failure returns to. */
export function unknownProgress(): ReferralProgress {
  return {
    appointmentBooked: false,
    onMarket: false,
    tenantFound: false,
    referencing: false,
    movedIn: false,
    didNotProceed: false,
    soldStc: false,
    exchanged: false,
    matched: false,
    checkedAt: new Date().toISOString(),
  };
}

// Sales. Confirmed against the live account: system_listing_state runs
// current / sold / withdrawn, under_contract is a boolean, and contract_status
// reads "Completed".
//
// James's call (3 Aug 2026): treat contract_status "Completed" as EXCHANGED.
// Strictly, completion follows exchange in English conveyancing, so this
// reports exchange slightly late rather than early — which is the safe
// direction, since the referral fee shouldn't light up before the deal is
// genuinely binding.
const EXCHANGED_CONTRACT_STATUSES = new Set(["completed", "exchanged"]);

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
 * Resolve a referral's real-world stages, from whichever system owns them.
 *
 * Throws if the upstream system is unreachable — the caller decides how to
 * present that. It must NOT be collapsed into "no progress", which would show
 * a landlord who is already let as though nothing had happened.
 */
export async function progressForReferral(
  email: string,
  brandId: string
): Promise<ReferralProgress> {
  const clean = email.trim().toLowerCase();
  if (!clean) return unknownProgress();
  return PROPOLY_BRANDS.has(brandId)
    ? lettingsProgress(clean)
    : salesProgress(clean, brandId);
}

/** Lettings — Propoly owns the whole tenancy pipeline. */
async function lettingsProgress(email: string): Promise<ReferralProgress> {
  const out = unknownProgress();
  if (!propolyConfigured()) return out;

  const tenancy = await tenancyProgressFor(email);
  out.matched = tenancy.matched;
  out.tenantFound = tenancy.tenantFound;
  out.referencing = tenancy.referencing;
  out.movedIn = tenancy.movedIn;
  out.didNotProceed = tenancy.didNotProceed;

  // Propoly starts at the tenancy, so the marketing stages are inferred: a deal
  // can only exist for a property that was appraised and marketed first.
  // Implying backwards is safe; implying anything forwards would not be.
  if (tenancy.tenantFound || tenancy.didNotProceed) {
    out.onMarket = true;
    out.appointmentBooked = true;
  }
  if (out.movedIn) out.referencing = true;
  if (out.referencing) out.tenantFound = true;
  return out;
}

/** Sales — Rex owns the whole vendor pipeline. */
async function salesProgress(
  email: string,
  brandId: string
): Promise<ReferralProgress> {
  const out = unknownProgress();
  const clean = email;
  if (!rexConfigured()) return out;

  // 1. Vendor email → contact.
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

  // 3. Listed / sold — needs a full read per listing, because the relationship
  //    projection carries no state.
  for (const id of listingIds) {
    const listing = await rexReadRecord("Listings", id, brandId);
    if (!listing) continue;
    const state = enumId(listing.system_listing_state);
    // Any listing at all means the property reached the market.
    if (state) out.onMarket = true;
    // under_contract is the "sold subject to contract" signal; the listing
    // state going to "sold" says the same thing a beat later.
    if (listing.under_contract === true) out.soldStc = true;
    if (state === "sold") out.soldStc = true;
    const contract = String(enumId(listing.contract_status) ?? "").toLowerCase();
    if (contract && EXCHANGED_CONTRACT_STATUSES.has(contract)) out.exchanged = true;
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
  if (out.soldStc) out.onMarket = true;
  if (out.exchanged) out.soldStc = true;

  return out;
}
