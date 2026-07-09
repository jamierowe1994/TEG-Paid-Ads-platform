import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth";
import { findById } from "@/lib/users-store";
import {
  getCampaignSnapshot,
  getCampaignCreative,
  parseCampaignIds,
  metaTokenSet,
  sanitizePreset,
} from "@/lib/meta";

// The signed-in agent's OWN live ad stats — insights for the Meta campaign(s)
// the admin tagged on their profile, scoped inside their brand's ad account.
// Returns { configured: false } until both the brand connection and their
// campaign id(s) exist, so the dashboard can show placeholders honestly.
export async function GET(req: NextRequest) {
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const user = await findById(userId);
  if (!user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const campaignIds = parseCampaignIds(user.metaCampaignId);
  if (!metaTokenSet() || campaignIds.length === 0) {
    return NextResponse.json({ configured: false });
  }

  const preset = sanitizePreset(req.nextUrl.searchParams.get("preset"));
  try {
    // Creative is best-effort (returns null on any failure) — the stats
    // shouldn't disappear just because a thumbnail couldn't be fetched.
    const [snapshot, creative] = await Promise.all([
      getCampaignSnapshot(user.brandId, campaignIds, preset),
      getCampaignCreative(user.brandId, campaignIds),
    ]);
    if (!snapshot) return NextResponse.json({ configured: false });
    return NextResponse.json({ configured: true, snapshot, creative });
  } catch (e) {
    return NextResponse.json({
      configured: true,
      error: e instanceof Error ? e.message : "Meta request failed",
    });
  }
}
