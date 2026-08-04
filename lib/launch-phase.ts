// Which launch we're in, and therefore what's switched on.
//
// V1 (Thursday 6 Aug 2026) goes to The Lettings Experts ONLY. V2 opens the
// platform to the rest of the group.
//
// Referrals are OFF in V1, and that is a product requirement rather than a
// technical one: a referral network only works when there's someone to refer
// to. With only TLE on the platform, a partner sending a referral to The
// Mortgage Experts would be sending it into a void — no recipient, no routing,
// no reply. Showing the tab and letting it fail would do more damage than
// hiding it, so it's locked until V2.
//
// DEFAULTS TO V1 ON PURPOSE. The launch itself then needs no action on the
// day — the app is already in the right state when it goes out. The only
// manual flip is turning V2 ON, which happens later with no time pressure.
// That ordering is deliberate: the risky, deadline-bound step should be the
// one that requires nobody to remember anything.
//
// To turn referrals back on (V2, or local testing before Thursday):
//   LAUNCH_PHASE=v2

export type LaunchPhase = "v1" | "v2";

export function launchPhase(): LaunchPhase {
  // Anything other than an explicit "v2" is treated as V1. An unset, empty or
  // misspelled value must fail CLOSED — the cost of referrals being wrongly
  // hidden is a confused partner, the cost of them being wrongly shown is a
  // referral disappearing with nobody to receive it.
  return (process.env.LAUNCH_PHASE ?? "").trim().toLowerCase() === "v2"
    ? "v2"
    : "v1";
}

/** Referrals open up in V2, once there's a group-wide network to refer into. */
export function referralsEnabled(): boolean {
  return launchPhase() === "v2";
}

/** Shown wherever referrals are locked, so the copy stays consistent. */
export const REFERRALS_LOCKED_COPY = {
  title: "Referrals are coming soon",
  blurb:
    "Referrals open up once the rest of the group is on Launch Pad. We'll let you know the moment they go live.",
} as const;
