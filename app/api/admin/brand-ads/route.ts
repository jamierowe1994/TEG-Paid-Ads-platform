import { NextRequest, NextResponse } from "next/server";
import { adminScope } from "@/lib/admin-auth";
import { listUsers } from "@/lib/users-store";
import { listLeadsForUser } from "@/lib/leads-store";
import {
  getCampaignSnapshot,
  getAdsWithCreatives,
  getAdInsightsByAd,
  parseCampaignIds,
  metaTokenSet,
  sanitizePreset,
} from "@/lib/meta";
import { brandById } from "@/lib/brands";

/* Every agent's ads in one brand, with the money and the outcomes side by side.
 *
 * Built for the marketing seat (Francesca at TLE), who could see that ads
 * existed but not what any of them cost or produced. For each agent running
 * campaigns: spend, leads, conversions, cost per lead — and then the same per
 * individual ad, so "which creative actually books appraisals?" has an answer.
 *
 * Two sources are joined here and they don't share a key:
 *   · Meta gives spend / impressions / clicks / leads PER AD, keyed by ad id.
 *   · Our funnel gives leads and conversions, which carry the AD NAME the
 *     lead came from (that's what Meta's lead form tells us).
 * So per-ad rows are matched on name. Where Meta knows an ad we've never had
 * a lead from, it still shows (spend with nothing to show for it is exactly
 * the row marketing wants to see). Where a lead names an ad Meta doesn't
 * list any more, it shows with no spend.
 *
 * ?brandId=&preset=  (preset as lib/meta: last_7d, last_30d, this_month…)
 * Super: any brand. MD / marketing: their own brand only.
 *
 * This fans out to Meta per agent, so it's cached for five minutes per
 * brand+preset. A second person opening the tab shouldn't cost a second
 * round of API calls.
 */
export const dynamic = "force-dynamic";

interface AdLine {
  adId: string | null;
  adName: string;
  status: string | null;
  imageUrl: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  metaLeads: number;
  leads: number;
  converted: number;
  cpl: number | null;
  costPerConversion: number | null;
  rate: number | null;
}

interface AgentLine {
  userId: string;
  name: string;
  email: string;
  packageId: string;
  campaignIds: string[];
  connected: boolean;
  spend: number;
  impressions: number;
  clicks: number;
  metaLeads: number;
  leads: number;
  converted: number;
  cpl: number | null;
  costPerConversion: number | null;
  rate: number | null;
  ads: AdLine[];
  error?: string;
}

const CACHE_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; body: unknown }>();

const CONVERTED = new Set(["converted", "pushed"]);

function per(spend: number, n: number): number | null {
  return n > 0 && spend > 0 ? Math.round((spend / n) * 100) / 100 : null;
}

export async function GET(req: NextRequest) {
  const scope = adminScope(req);
  if (!scope) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const brandId = req.nextUrl.searchParams.get("brandId") ?? "";
  if (!brandById(brandId)) {
    return NextResponse.json({ error: "brandId is required" }, { status: 400 });
  }
  if (scope.role !== "super" && scope.brandId !== brandId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const preset = sanitizePreset(req.nextUrl.searchParams.get("preset"));

  const key = `${brandId}:${preset}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS && !req.nextUrl.searchParams.has("fresh")) {
    return NextResponse.json(hit.body);
  }

  const metaOn = metaTokenSet();
  const agents = (await listUsers()).filter(
    (u) => u.brandId === brandId && !u.deactivatedAt
  );

  const lines: AgentLine[] = [];
  // Serial on purpose: each agent is several Graph calls, and twenty agents
  // in parallel is how you meet Meta's rate limiter.
  for (const u of agents) {
    const campaignIds = parseCampaignIds(u.metaCampaignId);
    const leads = await listLeadsForUser(u.id);

    // Funnel side, grouped by the ad the lead came from.
    const byAd = new Map<string, { leads: number; converted: number }>();
    for (const l of leads) {
      const name = (l.adName ?? "").trim() || "(no ad — added by hand or referral)";
      const g = byAd.get(name) ?? { leads: 0, converted: 0 };
      g.leads++;
      if (CONVERTED.has(l.stage)) g.converted++;
      byAd.set(name, g);
    }
    const funnelLeads = leads.length;
    const funnelConverted = leads.filter((l) => CONVERTED.has(l.stage)).length;

    const line: AgentLine = {
      userId: u.id,
      name: u.name,
      email: u.email,
      packageId: u.packageId,
      campaignIds,
      connected: campaignIds.length > 0,
      spend: 0,
      impressions: 0,
      clicks: 0,
      metaLeads: 0,
      leads: funnelLeads,
      converted: funnelConverted,
      cpl: null,
      costPerConversion: null,
      rate: funnelLeads > 0 ? Math.round((funnelConverted / funnelLeads) * 100) : null,
      ads: [],
    };

    if (campaignIds.length > 0 && metaOn) {
      try {
        const [snap, ads, figures] = await Promise.all([
          getCampaignSnapshot(brandId, campaignIds, preset),
          getAdsWithCreatives(brandId, campaignIds),
          getAdInsightsByAd(brandId, campaignIds, preset),
        ]);
        if (snap) {
          line.spend = snap.spend;
          line.impressions = snap.impressions;
          line.clicks = snap.clicks;
          line.metaLeads = snap.leads;
        }
        const seen = new Set<string>();
        for (const ad of ads) {
          const f = figures[ad.id];
          const fun = byAd.get(ad.name) ?? { leads: 0, converted: 0 };
          seen.add(ad.name);
          const spend = f?.spend ?? 0;
          line.ads.push({
            adId: ad.id,
            adName: ad.name,
            status: ad.status,
            imageUrl: ad.imageUrl,
            spend,
            impressions: f?.impressions ?? 0,
            clicks: f?.clicks ?? 0,
            metaLeads: f?.leads ?? 0,
            leads: fun.leads,
            converted: fun.converted,
            cpl: per(spend, fun.leads || (f?.leads ?? 0)),
            costPerConversion: per(spend, fun.converted),
            rate: fun.leads > 0 ? Math.round((fun.converted / fun.leads) * 100) : null,
          });
        }
        // Leads from ads Meta no longer lists (paused and gone, renamed).
        for (const [name, fun] of byAd) {
          if (seen.has(name)) continue;
          line.ads.push({
            adId: null,
            adName: name,
            status: null,
            imageUrl: null,
            spend: 0,
            impressions: 0,
            clicks: 0,
            metaLeads: 0,
            leads: fun.leads,
            converted: fun.converted,
            cpl: null,
            costPerConversion: null,
            rate: fun.leads > 0 ? Math.round((fun.converted / fun.leads) * 100) : null,
          });
        }
      } catch (e) {
        line.error = e instanceof Error ? e.message : "Meta didn't answer";
      }
    } else {
      for (const [name, fun] of byAd) {
        line.ads.push({
          adId: null,
          adName: name,
          status: null,
          imageUrl: null,
          spend: 0,
          impressions: 0,
          clicks: 0,
          metaLeads: 0,
          leads: fun.leads,
          converted: fun.converted,
          cpl: null,
          costPerConversion: null,
          rate: fun.leads > 0 ? Math.round((fun.converted / fun.leads) * 100) : null,
        });
      }
    }

    line.cpl = per(line.spend, line.leads || line.metaLeads);
    line.costPerConversion = per(line.spend, line.converted);
    // Most spend first; unconnected agents at the bottom.
    line.ads.sort((a, b) => b.spend - a.spend || b.leads - a.leads);
    lines.push(line);
  }

  lines.sort((a, b) => Number(b.connected) - Number(a.connected) || b.spend - a.spend);

  const totals = lines.reduce(
    (t, l) => ({
      spend: t.spend + l.spend,
      leads: t.leads + l.leads,
      converted: t.converted + l.converted,
      connected: t.connected + (l.connected ? 1 : 0),
    }),
    { spend: 0, leads: 0, converted: 0, connected: 0 }
  );

  const body = {
    brandId,
    preset,
    metaConnected: metaOn,
    generatedAt: new Date().toISOString(),
    totals: {
      ...totals,
      cpl: per(totals.spend, totals.leads),
      costPerConversion: per(totals.spend, totals.converted),
      rate: totals.leads > 0 ? Math.round((totals.converted / totals.leads) * 100) : null,
    },
    agents: lines,
  };
  cache.set(key, { at: Date.now(), body });
  return NextResponse.json(body);
}
