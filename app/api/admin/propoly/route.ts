// Is the lettings pipeline actually working in production?
//
// Built because "it's deployed and the env vars are set" does NOT mean a
// referral will show stages. Lettings joins Launch Pad to Propoly on the
// landlord's EMAIL, so a referral only lights up if the address the referrer
// typed matches the one that landlord gave Propoly. When it doesn't match
// there is no error — the referral just sits at "awaiting feed" forever,
// looking exactly like a landlord who hasn't progressed yet.
//
// That's a silent failure, so this route makes it loud: it reports whether
// production can reach Propoly at all, and which specific lettings referrals
// have no matching landlord. Super-admin only — it exposes referral emails
// across every brand.

import { NextRequest, NextResponse } from "next/server";
import { isSuperAdmin } from "@/lib/admin-auth";
import { listAllReferrals } from "@/lib/referrals-store";
import { dealBook, propolyConfigured, tenancyProgressFor } from "@/lib/propoly";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isSuperAdmin(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  if (!propolyConfigured()) {
    return NextResponse.json({
      ok: false,
      reason:
        "PROPOLY_API_KEY / PROPOLY_AGENT_NAME / PROPOLY_API_BASE are not all set on this service.",
    });
  }

  const startedAt = Date.now();
  const book = await dealBook();
  const buildMs = Date.now() - startedAt;

  if (!book.total) {
    return NextResponse.json({
      ok: false,
      reason:
        "Propoly is configured but returned no deals — the credentials are probably being rejected.",
      buildMs,
    });
  }

  const lettings = (await listAllReferrals()).filter(
    (r) => r.toBrandId === "lettings"
  );

  const matched: Record<string, unknown>[] = [];
  const unmatched: Record<string, unknown>[] = [];
  for (const r of lettings) {
    const email = r.leadEmail?.trim().toLowerCase() ?? "";
    if (!email) {
      unmatched.push({ id: r.id, name: r.leadName, email: null, why: "no email on the referral" });
      continue;
    }
    const p = await tenancyProgressFor(email);
    if (p.matched) {
      matched.push({
        id: r.id,
        name: r.leadName,
        stage: p.didNotProceed
          ? "didn't proceed"
          : p.movedIn
            ? "moved in"
            : p.referencing
              ? "referencing"
              : "tenant found",
      });
    } else {
      unmatched.push({
        id: r.id,
        name: r.leadName,
        email,
        why: "no Propoly landlord with this email",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    propoly: {
      reachable: true,
      dealsIndexed: book.total,
      distinctLandlords: book.byLandlordEmail.size,
      bookComplete: book.complete,
      buildMs,
    },
    referrals: {
      lettingsTotal: lettings.length,
      matched: matched.length,
      unmatched: unmatched.length,
    },
    // The actionable part: these are the referrals that will silently never
    // show progress until the email is corrected.
    unmatchedDetail: unmatched,
    matchedDetail: matched,
  });
}
