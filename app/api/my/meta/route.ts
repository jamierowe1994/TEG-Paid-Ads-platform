import { NextRequest, NextResponse } from "next/server";
import { requirePaidUser } from "@/lib/api-guard";
import {
  getCampaignSnapshot,
  getAdsWithCreatives,
  parseCampaignIds,
  metaTokenSet,
  sanitizePreset,
} from "@/lib/meta";

// The signed-in agent's OWN live ad stats — insights for the Meta campaign(s)
// the admin tagged on their profile, scoped inside their brand's ad account.
// Returns { configured: false } until both the brand connection and their
// campaign id(s) exist, so the dashboard can show placeholders honestly.
export async function GET(req: NextRequest) {
  const guard = await requirePaidUser(req);
  if (guard.error) return guard.error;
  const user = guard.user;
  const userId = user.id;

  const campaignIds = parseCampaignIds(user.metaCampaignId);
  if (!metaTokenSet() || campaignIds.length === 0) {
    return NextResponse.json({ configured: false });
  }

  const preset = sanitizePreset(req.nextUrl.searchParams.get("preset"));
  try {
    // Creatives are best-effort (empty on any failure) — the stats shouldn't
    // disappear just because thumbnails couldn't be fetched. The overview's
    // "Current ad" tile rotates through every ad that has an image.
    const [snapshot, ads] = await Promise.all([
      getCampaignSnapshot(user.brandId, campaignIds, preset),
      getAdsWithCreatives(user.brandId, campaignIds),
    ]);
    if (!snapshot) return NextResponse.json({ configured: false });
    const creatives = ads
      .filter((a) => a.imageUrl)
      .map((a) => ({ adName: a.name, imageUrl: a.imageUrl as string }));
    return NextResponse.json({ configured: true, snapshot, creatives });
  } catch (e) {
    return NextResponse.json({
      configured: true,
      error: e instanceof Error ? e.message : "Meta request failed",
    });
  }
}
