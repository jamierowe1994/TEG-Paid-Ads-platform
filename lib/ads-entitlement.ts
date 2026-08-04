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
  "kirstie.mulholland@thelettingexperts.co.uk":
    "Runs TLE back-office and admin. Gets the same £100 ad spend without paying for Pro (James, 4 Aug 2026).",
};

/** Why this person is an exception, or null if they aren't one. */
export function adsException(email: string): string | null {
  return ADS_EXCEPTIONS[email.trim().toLowerCase()] ?? null;
}

/**
 * Does this person get Paid Ads included? The single test, so signup and the
 * launch roster can never disagree about who is entitled.
 */
export function licenceIncludesAds(
  email: string,
  partnerPackage: string | null
): boolean {
  if (adsException(email)) return true;
  return INCLUDES_ADS.has((partnerPackage ?? "").trim().toLowerCase());
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
    outcome: licenceIncludesAds(email, partnerPackage)
      ? "included"
      : "needs-upgrade",
    partnerPackage,
    foundInHub: found && teamHubConfigured(),
  };
}
