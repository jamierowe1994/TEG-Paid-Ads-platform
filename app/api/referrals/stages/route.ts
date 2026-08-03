// Real pipeline stages for the referrals the caller can already see.
//
// Read-only, and deliberately scoped to the SAME set `listForUser` returns —
// so this can never become a way to look up an arbitrary email against the
// lettings CRM. A referral the caller can't see gets no answer.
//
// Lettings resolves from Propoly and property from Rex; every other brand
// returns nothing and the page keeps showing those stages as awaiting a feed.

import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth";
import { findById } from "@/lib/users-store";
import { listForUser } from "@/lib/referrals-store";
import {
  progressForReferral,
  type ReferralProgress,
} from "@/lib/lettings-tracker";
import { rexConfigured } from "@/lib/rex";
import { propolyConfigured } from "@/lib/propoly";

export const dynamic = "force-dynamic";

// A landlord's progress changes over days, not seconds, and each lookup costs
// several Rex calls. Cache per email so a page with ten referrals to the same
// landlord — or a quick refresh — doesn't re-walk the CRM.
const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; value: ReferralProgress }>();

// Which system answers for which brand. A brand is only worth asking about if
// its system is actually connected — otherwise the referral is left awaiting a
// feed rather than reported as "no progress".
function trackable(brandId: string): boolean {
  if (brandId === "lettings") return propolyConfigured();
  if (brandId === "property") return rexConfigured();
  return false;
}

async function progressFor(
  email: string,
  brandId: string
): Promise<ReferralProgress | null> {
  const key = `${brandId}:${email.trim().toLowerCase()}`;
  if (!email.trim()) return null;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = await progressForReferral(email, brandId);
  cache.set(key, { at: Date.now(), value });
  return value;
}

export async function GET(req: NextRequest) {
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  const user = userId ? await findById(userId) : null;
  if (!user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  // Neither system connected (local dev, or before the env is set) is not an
  // error — the page simply keeps its "awaiting feed" state.
  if (!rexConfigured() && !propolyConfigured()) {
    return NextResponse.json({ connected: false, stages: {} });
  }

  const referrals = await listForUser(user.id, user.brandId);
  const tracked = referrals.filter(
    (r) => trackable(r.toBrandId) && r.leadEmail.trim()
  );

  const stages: Record<string, ReferralProgress> = {};
  let failed = 0;
  // Sequential on purpose: this is several Rex calls per referral and Rex
  // resets tokens under bursts. The list is small and the result is cached.
  for (const r of tracked) {
    try {
      const p = await progressFor(r.leadEmail, r.toBrandId);
      if (p) stages[r.id] = p;
    } catch {
      // One landlord failing to resolve must not blank the whole page. The
      // referral just keeps its "awaiting feed" stages.
      failed++;
    }
  }

  return NextResponse.json({
    connected: true,
    checked: tracked.length,
    failed,
    stages,
  });
}
