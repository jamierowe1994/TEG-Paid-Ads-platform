import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth";
import { findById } from "@/lib/users-store";
import {
  getAdsWithCreatives,
  getAdInsightsByAd,
  parseCampaignIds,
  metaTokenSet,
  sanitizePreset,
} from "@/lib/meta";

// The signed-in agent's ads gallery: every ad in their tagged campaign(s),
// each with its creative image and its own figures for the chosen range.
// { configured: false } until the campaign link exists.
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
    const [ads, figures] = await Promise.all([
      getAdsWithCreatives(user.brandId, campaignIds),
      getAdInsightsByAd(user.brandId, campaignIds, preset),
    ]);
    return NextResponse.json({
      configured: true,
      preset,
      ads: ads.map((a) => ({ ...a, figures: figures[a.id] ?? null })),
    });
  } catch (e) {
    return NextResponse.json({
      configured: true,
      error: e instanceof Error ? e.message : "Meta request failed",
    });
  }
}
