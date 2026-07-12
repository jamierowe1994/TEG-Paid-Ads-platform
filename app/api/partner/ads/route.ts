import { NextRequest, NextResponse } from "next/server";
import { findByEmail } from "@/lib/users-store";
import {
  getCampaignSnapshot,
  getAdsWithCreatives,
  getAdInsightsByAd,
  parseCampaignIds,
  metaTokenSet,
  sanitizePreset,
} from "@/lib/meta";

// Partner API — lets a trusted sister app (e.g. the TLE partner portal) read an
// agent's live ad stats BY EMAIL, gated by a shared secret. Server-to-server
// only (the key never reaches a browser). Set PARTNER_API_KEY in this app's env
// and the same value as ADS_API_KEY in the calling app.
//
//   GET /api/partner/ads?email=agent@brand.co.uk&preset=last_30d
//   Authorization: Bearer <PARTNER_API_KEY>
//   → { found, configured, snapshot?, creatives?, ads? }

function authorised(req: NextRequest): boolean {
  const key = process.env.PARTNER_API_KEY;
  if (!key) return false; // not enabled until a key is configured
  const header = req.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  // Length-checked constant-ish compare.
  if (bearer.length !== key.length) return false;
  let diff = 0;
  for (let i = 0; i < key.length; i++) diff |= bearer.charCodeAt(i) ^ key.charCodeAt(i);
  return diff === 0;
}

export async function GET(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const email = (req.nextUrl.searchParams.get("email") ?? "").trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  const user = await findByEmail(email);
  if (!user) {
    return NextResponse.json({ found: false });
  }

  const campaignIds = parseCampaignIds(user.metaCampaignId);
  if (!metaTokenSet() || campaignIds.length === 0) {
    // Matched the agent, but their ad campaign isn't wired up (or no token).
    return NextResponse.json({ found: true, configured: false });
  }

  const preset = sanitizePreset(req.nextUrl.searchParams.get("preset"));
  try {
    const [snapshot, ads, figures] = await Promise.all([
      getCampaignSnapshot(user.brandId, campaignIds, preset),
      getAdsWithCreatives(user.brandId, campaignIds),
      getAdInsightsByAd(user.brandId, campaignIds, preset),
    ]);
    if (!snapshot) return NextResponse.json({ found: true, configured: false });

    const creatives = ads
      .filter((a) => a.imageUrl)
      .map((a) => ({ adName: a.name, imageUrl: a.imageUrl as string }));

    // Normalise to the portal's contract: snapshot gains a computed cpl, and
    // each ad row is flat (figures merged in).
    return NextResponse.json({
      found: true,
      configured: true,
      preset,
      snapshot: {
        impressions: snapshot.impressions,
        clicks: snapshot.clicks,
        spend: snapshot.spend,
        leads: snapshot.leads,
        cpl: snapshot.leads > 0 ? snapshot.spend / snapshot.leads : null,
        datePreset: snapshot.datePreset,
      },
      creatives,
      ads: ads.map((a) => {
        const f = figures[a.id];
        return {
          id: a.id,
          name: a.name,
          status: a.status,
          imageUrl: a.imageUrl,
          impressions: f?.impressions ?? 0,
          clicks: f?.clicks ?? 0,
          spend: f?.spend ?? 0,
          leads: f?.leads ?? 0,
          cpl: f?.cpl ?? null,
        };
      }),
    });
  } catch (e) {
    return NextResponse.json({
      found: true,
      configured: true,
      error: e instanceof Error ? e.message : "Meta request failed",
    });
  }
}
