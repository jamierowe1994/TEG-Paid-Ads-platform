import { NextRequest, NextResponse } from "next/server";
import { listLeadsForUser } from "@/lib/leads-store";
import { findById } from "@/lib/users-store";
import { adminScope } from "@/lib/admin-auth";

// Where an agent's leads actually came from — grouped by the Meta ad/campaign
// name on each lead. Built to answer "why does this agent have so many leads?"
// when the sole-agent catch-all has been sweeping the whole Page's forms in.
// ?userId=<id>
export async function GET(req: NextRequest) {
  const scope = adminScope(req);
  if (!scope) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }
  const agent = await findById(userId);
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }
  // An MD can only inspect their own brand's agents.
  if (scope.role === "md" && agent.brandId !== scope.brandId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const leads = await listLeadsForUser(userId);

  // Group by the ad/campaign name — leads from an ad other than the agent's
  // own are the tell-tale of over-capture.
  const byAd = new Map<
    string,
    { count: number; first: string; last: string }
  >();
  const bySource = new Map<string, number>();
  let fromMeta = 0;

  for (const l of leads) {
    const ad = (l.adName ?? "").trim() || "(no ad — manual / referral)";
    const g = byAd.get(ad) ?? { count: 0, first: l.receivedAt, last: l.receivedAt };
    g.count++;
    if (l.receivedAt < g.first) g.first = l.receivedAt;
    if (l.receivedAt > g.last) g.last = l.receivedAt;
    byAd.set(ad, g);

    bySource.set(l.source, (bySource.get(l.source) ?? 0) + 1);
    if (l.metaLeadId) fromMeta++;
  }

  const ads = [...byAd.entries()]
    .map(([adName, g]) => ({ adName, ...g }))
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({
    agent: { id: agent.id, name: agent.name, brandId: agent.brandId },
    total: leads.length,
    fromMeta,
    fromOther: leads.length - fromMeta,
    taggedCampaigns: (agent.metaCampaignId ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    bySource: [...bySource.entries()].map(([source, count]) => ({
      source,
      count,
    })),
    ads,
  });
}
