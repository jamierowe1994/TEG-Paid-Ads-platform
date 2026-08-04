// Paid ads packages, as set out in the partner pack ("TEG - LAUNCHPAD - Leads
// for our Partners"). The model there is deliberately simple and the site
// mirrors it exactly:
//
//   · One flat management fee of £100/month, identical on every package.
//   · The only thing the agent chooses is daily ad spend — £5, £10 or £15.
//   · Everything else (creative, optimisation, dashboard, nurture, location
//     exclusivity) is included on all three.
//
// So `price` = MANAGEMENT_FEE + adSpend, and the tiers differ by ad spend
// alone. Monthly ad spend is the pack's stated approximation (daily × 30),
// which is why it's quoted as "approx" wherever it's shown.
//
// Pricing is live copy but Stripe isn't wired yet — each package carries a
// `stripePriceId` slot ready for the real Stripe Price IDs.

/** Flat monthly management fee, the same on every package. */
export const MANAGEMENT_FEE = 100;

/**
 * Included on every package without exception — the pack's "everything
 * included in every package" grid. Shared rather than per-package because
 * the whole pitch is that the tiers are otherwise identical.
 */
export const INCLUDED_IN_EVERY_PACKAGE: { title: string; detail: string }[] = [
  {
    title: "Full ad creative and copy",
    detail:
      "We design and write everything. Not a brief or word of copy needed from you.",
  },
  {
    title: "Monthly campaign optimisation",
    detail:
      "Every month we review performance and adjust to improve your cost per lead.",
  },
  {
    title: "Your private dashboard",
    detail:
      "See spend, reach, engagement, leads and funnel stage in real time. No chasing.",
  },
  {
    title: "Full lead nurture included",
    detail:
      "We communicate with your leads until they are ready for a conversation.",
  },
  {
    title: "Location exclusivity",
    detail:
      "Your area is yours. No other agent in your location runs the same campaign.",
  },
  {
    title: "LinkedIn coming soon",
    detail:
      "Meta is live now. LinkedIn is launching next. You will be first in line.",
  },
];

/** The commitment terms, shown as a row under the packages. */
export const PACKAGE_TERMS = [
  "3-month minimum",
  "Then rolling monthly",
  "Adjust at any renewal",
  "Real-time visibility",
];

export interface AdPackage {
  id: "starter" | "growth" | "accelerate";
  name: string;
  price: number; // total GBP per month = management fee + ad spend
  managementFee: number; // our fee for building + running the ads
  adSpend: number; // approx monthly ad spend paid to Meta (daily × 30)
  dailyAdSpend: number; // what the agent actually picks
  tagline: string;
  bestFor: string; // "Best for" line from the pack
  features: string[];
  highlighted?: boolean;
  stripePriceId: string | null; // TODO(stripe): plug in real Stripe Price ID
}

const FEATURES = INCLUDED_IN_EVERY_PACKAGE.map((f) => f.title);

export const PACKAGES: AdPackage[] = [
  {
    id: "starter",
    name: "Starter",
    price: MANAGEMENT_FEE + 150,
    managementFee: MANAGEMENT_FEE,
    adSpend: 150,
    dailyAdSpend: 5,
    tagline:
      "The right entry point to test the model, get your first leads in the door and see what the dashboard can do.",
    bestFor: "Agents testing paid ads or covering a smaller location",
    features: FEATURES,
    stripePriceId: null,
  },
  {
    id: "growth",
    name: "Growth",
    price: MANAGEMENT_FEE + 300,
    managementFee: MANAGEMENT_FEE,
    adSpend: 300,
    dailyAdSpend: 10,
    tagline:
      "A steady, consistent lead flow. Enough budget to build a proper pipeline month on month.",
    bestFor:
      "Agents ready to commit to a regular lead source and grow their active pipeline",
    features: FEATURES,
    highlighted: true,
    stripePriceId: null,
  },
  {
    id: "accelerate",
    name: "Accelerate",
    price: MANAGEMENT_FEE + 450,
    managementFee: MANAGEMENT_FEE,
    adSpend: 450,
    dailyAdSpend: 15,
    tagline:
      "Maximum reach across your area. Designed for agents who want to dominate their location and scale quickly.",
    bestFor:
      "Established agents looking to expand market share across a wider geography",
    features: FEATURES,
    stripePriceId: null,
  },
];

// The top tier was called "scale" before the pack renamed it "Accelerate".
// Accounts created under the old id are still stored that way, so map it
// across rather than leaving those users with no package at all.
const LEGACY_IDS: Record<string, AdPackage["id"]> = { scale: "accelerate" };

export function packageById(id: string | null | undefined): AdPackage | undefined {
  if (!id) return undefined;
  const resolved = LEGACY_IDS[id] ?? id;
  return PACKAGES.find((p) => p.id === resolved);
}

// ── The Lettings Experts' Pro licence ───────────────────────────────────────
//
// TLE launched Paid Ads first, and it's bundled into their Pro licence rather
// than sold as one of the packages above. That bundle allows **£100 of ad
// spend a month** — NOT the £150/£300/£450 the packages carry.
//
// This matters because every TLE Pro account is created on the default
// "starter" package (there's nothing else to put there — they never picked a
// package and never paid for one). Reading `adSpend` off that package would
// tell a TLE partner they had £150/mo to spend, and progress bars would sit
// at two thirds of a budget that doesn't exist. Their real spend hovers
// around £100 because £100 is the actual cap.
//
// Every other brand is unaffected and uses its package's ad spend as before.

/** Monthly ad spend included in the TLE Pro licence. */
export const TLE_PRO_AD_SPEND_CAP = 100;

/** Brands whose ad spend comes from a licence rather than a package. */
const LICENCE_CAPPED_BRANDS = new Set(["lettings"]);

/**
 * The monthly ad spend budget for an account — the single source of truth.
 *
 * Use this ANYWHERE a cap is shown or measured against. Reading
 * `packageById(user.packageId).adSpend` directly is what this exists to
 * replace: it is right for most of the group and quietly wrong for TLE.
 */
export function adSpendCapFor(
  brandId: string | null | undefined,
  packageId: string | null | undefined
): number {
  if (brandId && LICENCE_CAPPED_BRANDS.has(brandId)) {
    return TLE_PRO_AD_SPEND_CAP;
  }
  return packageById(packageId)?.adSpend ?? 0;
}
