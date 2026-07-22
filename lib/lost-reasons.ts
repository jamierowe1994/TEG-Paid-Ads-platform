import type { BrandId } from "./brands";

// Why a lead was marked lost — the reasons are tailored per brand, since what
// "lost" means differs for estate agents vs lettings vs recruitment etc.
//
// `warm` reasons aren't real losses — they're "not yet". Picking one offers the
// Keep Warm comeback-date flow (bring the lead back later) instead of closing
// the door. Anything not in `warm` is a hard loss.

interface BrandReasons {
  reasons: string[];
  warm: string[];
}

// Fallback for brands without a bespoke list (Mortgage, Commercial, Auction).
const DEFAULT: BrandReasons = {
  reasons: [
    "Couldn't make contact",
    "Not the right time",
    "Just thinking about it / later",
    "Went with someone else",
    "Budget / price",
    "Not interested",
    "Other",
  ],
  warm: ["Not the right time", "Just thinking about it / later", "Budget / price"],
};

const BY_BRAND: Partial<Record<BrandId, BrandReasons>> = {
  property: {
    reasons: [
      "Not responded to",
      "Not responded to quick enough",
      "Left incorrect details",
      "Too long before an MA could be carried out",
      "Poor comms from the Agent",
    ],
    warm: [],
  },
  lettings: {
    reasons: [
      "Currently tenanted",
      "Not ready",
      "Not a landlord",
      "Selling / Sold",
      "Went with another agent",
    ],
    warm: ["Currently tenanted", "Not ready"],
  },
  fineandcountry: {
    reasons: [
      "Fees/cost",
      "Gone with another agent",
      "Decided to not sell",
      "Staying with current agent",
      "Sold privately",
      "Lost contact",
    ],
    warm: ["Decided to not sell"],
  },
  recruitment: {
    reasons: [
      "Fee/cost",
      "Role filled",
      "Gone with a different recruiter",
      "Trying to fill themselves",
      "Was just looking at cost",
      "Lost contact",
    ],
    warm: ["Trying to fill themselves", "Was just looking at cost"],
  },
};

export function lostReasonsFor(brandId: BrandId): string[] {
  return (BY_BRAND[brandId] ?? DEFAULT).reasons;
}

// The subset that should offer "bring them back later" (Keep Warm).
export function warmReasonsFor(brandId: BrandId): Set<string> {
  return new Set((BY_BRAND[brandId] ?? DEFAULT).warm);
}
