// Who gets Paid Ads without paying for it.
//
// The Lettings Experts' Pro licence already includes Paid Ads, so a Pro partner
// must never be sent to Stripe — they'd be charged twice for the same thing.
// A TLE partner who ISN'T on Pro shouldn't be charged either; they're sent to
// upgrade their licence instead, because buying Paid Ads separately is worse
// value for them than the Pro tier that bundles it.
//
// So for TLE there are exactly two outcomes, and NEITHER is "pay us here":
//   Pro      → free access, skip payment entirely
//   anything → upgrade your licence, no payment taken
//
// Every other brand is unaffected and still goes through Stripe as before.
//
// FALLBACK (James, 4 Aug 2026): no package recorded, or not found in the Hub,
// is treated as NOT Pro — so they see the upgrade route rather than getting
// free access. The trade-off was made knowingly: a genuine Pro partner with
// bad Hub data gets wrongly sent to upgrade and will phone in, which is
// recoverable; the reverse silently gives away paid product and nobody finds
// out. As of 4 Aug 2026 exactly ONE active TLE partner has no package set, so
// this is a real path, not a theoretical one — expect that call.

import type { BrandId } from "./brands";
import { packageForEmail, teamHubConfigured } from "./team-hub";
import { LAUNCH_LIST_ACTIVE, onLaunchList } from "./tle-launch-list";
import { listLaunchExtras } from "./launch-list-extra";

/** Licence tiers that include Paid Ads. Pro only — confirmed by James. */
const INCLUDES_ADS = new Set(["pro"]);

/**
 * Named people who get Paid Ads WITHOUT a Pro licence.
 *
 * Deliberately held here rather than by editing `partner_package` in Team Hub.
 * Writing "Pro" onto their Hub record would state that they hold a licence
 * they don't pay for, and that field is read by other systems for billing and
 * reporting — so the fix would be a lie that spreads. Recording the exception
 * where the decision applies keeps Team Hub true and keeps the reason attached
 * to it.
 *
 * Every entry needs a why. If nobody can say why someone is on this list, they
 * should come off it.
 */
const ADS_EXCEPTIONS: Record<string, string> = {
  // Both addresses: she appears in Team Hub as Mulholland and signs in as
  // Wallington after a name change. Kept HERE as well as on the launch list
  // because she is not Pro and never will be — so when the launch list is
  // retired and entitlement goes back to reading `partner_package`, this is
  // what stops her losing access.
  "kirstie.wallington@thelettingexperts.co.uk":
    "Runs TLE back-office and admin. Gets the same £100 ad spend without paying for Pro (James, 4 Aug 2026).",
  "kirstie.mulholland@thelettingexperts.co.uk":
    "Former address for Kirstie Wallington — same person, kept so a Team Hub record under the old surname still resolves.",
};

/** Why this person is an exception, or null if they aren't one. */
export function adsException(email: string): string | null {
  return ADS_EXCEPTIONS[email.trim().toLowerCase()] ?? null;
}

/**
 * Does this person get Paid Ads included? The single test, so signup and the
 * launch roster can never disagree about who is entitled.
 *
 * While the V1 launch list is active it is DEFINITIVE for lettings and the
 * Hub's `partner_package` is ignored entirely. That's deliberate and cuts both
 * ways: it lets on someone the Hub still has as Basic, and it keeps out the
 * eight people the Hub marks Pro who aren't on Susan's list. Falling back to
 * the package would quietly re-admit those eight.
 *
 * See lib/tle-launch-list.ts for why the Hub can't be trusted for this yet,
 * and how to retire the list.
 */
export function licenceIncludesAds(
  email: string,
  partnerPackage: string | null,
  name?: string
): boolean {
  if (adsException(email)) return true;
  if (LAUNCH_LIST_ACTIVE) return onLaunchList(email, name);
  return INCLUDES_ADS.has((partnerPackage ?? "").trim().toLowerCase());
}

/* The same question, but also consulting people added to the roster through
 * the admin (launch_list_extra) — which the hardcoded list can't know about.
 *
 * This has to be the version every gate uses, or a latecomer half-exists:
 * Rhiannon Dodge was added to the roster on 26 Aug and Connect still refused
 * her, because the entitlement check only read the fixed file. Worse, fixing
 * Connect alone would have let her through and then locked her out — the
 * payment gate asks this same question, and an unpaid launch partner who
 * fails it gets a "finish payment" wall on an account that is supposed to be
 * covered by her licence.
 */
export async function licenceIncludesAdsAsync(
  email: string,
  partnerPackage: string | null,
  brandId: BrandId,
  name?: string
): Promise<boolean> {
  if (licenceIncludesAds(email, partnerPackage, name)) return true;
  if (!LAUNCH_LIST_ACTIVE) return false;
  try {
    const needle = email.trim().toLowerCase();
    return (await listLaunchExtras(brandId)).some((e) => e.email === needle);
  } catch {
    return false;
  }
}

/** Brands whose licence bundles Paid Ads. */
const BUNDLED_BRANDS = new Set<BrandId>(["lettings"]);

export type EntitlementOutcome =
  /** Licence includes ads — let them straight in, take no payment. */
  | "included"
  /** Their brand bundles ads but their tier doesn't — send them to upgrade. */
  | "needs-upgrade"
  /** Normal paid signup through Stripe. */
  | "pay";

export interface AdsEntitlement {
  outcome: EntitlementOutcome;
  /** The tier we found, for display and for support calls. Null if none. */
  partnerPackage: string | null;
  /** False when the Hub had no record — surfaced so support can tell the
   *  difference between "on the wrong tier" and "not in the Hub at all". */
  foundInHub: boolean;
}

/**
 * Decide how someone signing up should be charged, if at all.
 *
 * Deliberately keyed on email + brand rather than a stored flag, so it re-reads
 * the Hub each time. A partner who upgrades their licence gets access on their
 * next attempt without anyone re-syncing anything.
 */
export async function adsEntitlementFor(
  email: string,
  brandId: BrandId
): Promise<AdsEntitlement> {
  if (!BUNDLED_BRANDS.has(brandId)) {
    return { outcome: "pay", partnerPackage: null, foundInHub: false };
  }

  // Hub down or unconfigured lands here with found:false → "needs-upgrade".
  // That routes them to a human rather than charging them or letting them in
  // free, which is the right place for an unanswerable billing question.
  const { partnerPackage, found } = await packageForEmail(email);

  return {
    outcome: (await licenceIncludesAdsAsync(email, partnerPackage, brandId))
      ? "included"
      : "needs-upgrade",
    partnerPackage,
    foundInHub: found && teamHubConfigured(),
  };
}

/* Hot-path form of the same question, for the API tier gate: is this unpaid
 * account actually covered by a licence? Memoised per process because
 * requirePaidUser runs on every leads/meta request — the underlying Team Hub
 * directory is already cached, but even a cached scan per request is waste.
 * 10 minutes matches the directory TTL, so a licence change propagates on
 * the same clock either way. */
const licenceMemo = new Map<string, { at: number; covered: boolean }>();
const LICENCE_MEMO_MS = 10 * 60 * 1000;

export async function adsCoveredByLicence(
  email: string,
  brandId: BrandId
): Promise<boolean> {
  const key = `${brandId}:${email.trim().toLowerCase()}`;
  const hit = licenceMemo.get(key);
  if (hit && Date.now() - hit.at < LICENCE_MEMO_MS) return hit.covered;
  let covered = false;
  try {
    covered = (await adsEntitlementFor(email, brandId)).outcome === "included";
  } catch {
    /* Hub unreachable -> not covered; the gate then asks for payment, which
       is recoverable, rather than silently giving free access, which isn't. */
  }
  licenceMemo.set(key, { at: Date.now(), covered });
  return covered;
}
