import { NextRequest, NextResponse } from "next/server";
import { findByEmail } from "@/lib/users-store";
import { packageForEmail, teamHubConfigured } from "@/lib/team-hub";
import { licenceIncludesAdsAsync, adsException } from "@/lib/ads-entitlement";
import { LAUNCH_LIST_ACTIVE } from "@/lib/tle-launch-list";

/**
 * Partner API — is this person entitled to Paid Ads?
 *
 *   GET /api/partner/entitlement?email=agent@brand.co.uk
 *   Authorization: Bearer <PARTNER_API_KEY>
 *   → { entitled, reason, hasAccount, partnerPackage, sourceOfTruth }
 *
 * ── Why TLE OS asks rather than working it out ────────────────────────────
 *
 * TLE OS is putting Launch Pad behind a Pro-licence gate, and the obvious way
 * to build that gate is to read `partner_package` from Team Hub. Measured
 * against the live Hub on 29 Aug 2026, that gate would have been wrong in both
 * directions at once:
 *
 *   · 8 of Susan's 13 launch partners would have been REFUSED — six are still
 *     marked Basic, one Academy, and two have no package at all.
 *   · 8 other TLE partners marked Pro would have been ADMITTED, one of whom is
 *     recorded as Departed.
 *
 * Which is the same finding that put lib/tle-launch-list.ts here on 4 Aug, and
 * it has barely moved since: 4 of 13 then, 5 of 13 now.
 *
 * So entitlement is not a field, it is a DECISION — launch list, then admin
 * additions, then exceptions, then the package — and that decision already
 * lives here. Copying it into TLE OS would create a second copy of a rule that
 * has already drifted once inside this app alone: Rhiannon Dodge was added to
 * the roster on 26 Aug and Connect still refused her, because one gate read the
 * static file and another read the database. Two products doing that to each
 * other is the same bug with a deploy boundary through the middle, and the
 * symptom is the worst kind — someone let through one door and stopped at the
 * next, with each product certain it is right.
 *
 * One answer, asked once, from the app that owns the question.
 *
 * ── It reports WHY, not just yes or no ────────────────────────────────────
 *
 * `reason` exists so the caller can say something true to the person in front
 * of it. "Your licence doesn't include this" and "we can't find your record"
 * need different sentences and different phone calls, and a bare false makes
 * them identical. `sourceOfTruth` says which rule actually decided it, so that
 * when the launch list is retired anyone debugging this can see the answer
 * change hands rather than guessing.
 *
 * READ ONLY. Nothing here writes, and it deliberately cannot grant access —
 * it reports the decision this app would already have made.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authorised(req: NextRequest): boolean {
  const key = process.env.PARTNER_API_KEY;
  if (!key) return false; // not enabled until a key is configured
  const header = req.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (bearer.length !== key.length) return false;
  let diff = 0;
  for (let i = 0; i < key.length; i++) diff |= bearer.charCodeAt(i) ^ key.charCodeAt(i);
  return diff === 0;
}

/** Why they are or aren't entitled, in words the caller can show somebody. */
export type EntitlementReason =
  /** On the launch roster, or an exception, or their tier includes it. */
  | "entitled"
  /** Known to us, but their licence tier doesn't include Paid Ads. */
  | "not-pro"
  /** No record in Team Hub at all — cannot be judged, so treated as not entitled. */
  | "unknown-person"
  /** Team Hub isn't reachable, so this answer is "don't know", NOT "no". */
  | "unavailable";

export async function GET(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const email = (req.nextUrl.searchParams.get("email") ?? "").trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }
  const name = (req.nextUrl.searchParams.get("name") ?? "").trim() || undefined;

  /* Team Hub down is not the same as "not Pro", and must never be answered as
     one. A 503 lets the caller hold the door rather than tell a Pro partner
     their licence doesn't cover something it does — and an outage that silently
     revokes access for everybody is a far worse Monday than a spinner. */
  if (!teamHubConfigured()) {
    return NextResponse.json(
      { entitled: false, reason: "unavailable" as EntitlementReason, error: "Team Hub isn't configured on this environment." },
      { status: 503 }
    );
  }

  let partnerPackage: string | null = null;
  let foundInHub = false;
  try {
    const pkg = await packageForEmail(email);
    partnerPackage = pkg.partnerPackage;
    foundInHub = pkg.found;
  } catch {
    return NextResponse.json(
      { entitled: false, reason: "unavailable" as EntitlementReason, error: "Couldn't reach Team Hub." },
      { status: 503 }
    );
  }

  /* Lettings, because that is the brand whose licence bundles ads and the only
     one TLE OS asks about. Passed explicitly rather than derived from the email
     domain: three of Susan's partners are dual-brand and sign in on TPE and
     Prestige addresses. */
  const entitled = await licenceIncludesAdsAsync(email, partnerPackage, "lettings", name);

  const reason: EntitlementReason = entitled
    ? "entitled"
    : foundInHub
      ? "not-pro"
      : "unknown-person";

  /* Which rule actually decided it. While the launch list is active it
     overrides the package entirely, and anyone reading this response should be
     able to see that rather than infer it from a tier that was ignored. */
  const sourceOfTruth = adsException(email)
    ? "exception"
    : LAUNCH_LIST_ACTIVE
      ? "launch-list"
      : "partner-package";

  return NextResponse.json({
    entitled,
    reason,
    sourceOfTruth,
    /* Whether they have a Launch Pad login yet. Separate from entitlement on
       purpose: someone can be entitled and never have signed up, which is an
       invitation to send rather than a door to close. */
    hasAccount: Boolean(await findByEmail(email)),
    partnerPackage,
    foundInHub,
  });
}
