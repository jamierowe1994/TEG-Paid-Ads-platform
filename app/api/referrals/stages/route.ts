// Real pipeline stages for the referrals the caller can already see.
//
// Read-only, and deliberately scoped to the SAME set `listForUser` returns —
// so this can never become a way to look up an arbitrary email against the
// lettings CRM. A referral the caller can't see gets no answer.
//
// Only lettings referrals resolve today; every other brand returns nothing and
// the page keeps showing those stages as awaiting a feed.

import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth";
import { findById } from "@/lib/users-store";
import { listForUser } from "@/lib/referrals-store";
import {
  lettingsProgressForLandlord,
  type LettingsProgress,
} from "@/lib/lettings-tracker";
import { rexConfigured } from "@/lib/rex";

export const dynamic = "force-dynamic";

// A landlord's progress changes over days, not seconds, and each lookup costs
// several Rex calls. Cache per email so a page with ten referrals to the same
// landlord — or a quick refresh — doesn't re-walk the CRM.
const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; value: LettingsProgress }>();

async function progressFor(email: string): Promise<LettingsProgress | null> {
  const key = email.trim().toLowerCase();
  if (!key) return null;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = await lettingsProgressForLandlord(key);
  cache.set(key, { at: Date.now(), value });
  return value;
}

export async function GET(req: NextRequest) {
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  const user = userId ? await findById(userId) : null;
  if (!user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  // Rex not connected (local dev, or before the env is set) is not an error —
  // the page simply keeps its "awaiting feed" state.
  if (!rexConfigured()) {
    return NextResponse.json({ connected: false, stages: {} });
  }

  const referrals = await listForUser(user.id, user.brandId);
  const lettings = referrals.filter(
    (r) => r.toBrandId === "lettings" && r.leadEmail.trim()
  );

  const stages: Record<string, LettingsProgress> = {};
  let failed = 0;
  // Sequential on purpose: this is several Rex calls per referral and Rex
  // resets tokens under bursts. The list is small and the result is cached.
  for (const r of lettings) {
    try {
      const p = await progressFor(r.leadEmail);
      if (p) stages[r.id] = p;
    } catch {
      // One landlord failing to resolve must not blank the whole page. The
      // referral just keeps its "awaiting feed" stages.
      failed++;
    }
  }

  return NextResponse.json({
    connected: true,
    checked: lettings.length,
    failed,
    stages,
  });
}
