import { NextRequest, NextResponse } from "next/server";
import {
  getLeadgenForms,
  getFormLeads,
  getPageAccessToken,
  parseCampaignIds,
  resolveCampaignIds,
} from "@/lib/meta";
import { listLeadsForUser, deleteLeads } from "@/lib/leads-store";
import { findById } from "@/lib/users-store";
import { adminScope } from "@/lib/admin-auth";

// Undo the whole-Page over-capture: strip an agent's Meta leads that came from
// a campaign they haven't tagged. Referral/manual leads (no metaLeadId) are
// never touched.
//
// Every lead is judged against the agent's tagged campaigns:
//   • on-campaign      — its campaign is one the agent has tagged  -> KEEP
//   • off-campaign     — a different campaign on the same Page      -> REMOVE
//   • unverifiable     — Meta no longer returns it (form gone / too old to
//                        resolve) and it wasn't stamped locally     -> REMOVE
// Newer leads carry campaignId locally; older ones are resolved by re-reading
// the brand's forms from Meta (metaLeadId -> campaign_id).
//
// Preview by default. Pass { confirm: true } to actually delete. Super only —
// it's destructive and can cross brands.
export async function POST(req: NextRequest) {
  const scope = adminScope(req);
  if (!scope || scope.role !== "super") {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const userId = String(body?.userId ?? "");
  const confirm = body?.confirm === true;
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const agent = await findById(userId);
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const tagged = parseCampaignIds(agent.metaCampaignId);
  if (tagged.length === 0) {
    return NextResponse.json(
      {
        error:
          "Tag this agent's Meta campaign(s) first — without them there's nothing to keep leads against.",
      },
      { status: 400 }
    );
  }
  const keepCampaigns = new Set(await resolveCampaignIds(tagged));

  const leads = await listLeadsForUser(userId);
  const metaLeads = leads.filter((l) => l.metaLeadId);
  const nonMeta = leads.length - metaLeads.length;

  // Build a metaLeadId -> campaignId map from Meta for the leads that weren't
  // stamped locally (the historic 694). Only bother if some need it.
  const needResolve = metaLeads.some((l) => !l.campaignId);
  const metaCampaignById = new Map<string, string | null>();
  let metaReadable = true;
  if (needResolve) {
    try {
      const pageToken = (await getPageAccessToken(agent.brandId)) ?? undefined;
      const forms = await getLeadgenForms(agent.brandId);
      if (forms) {
        for (const f of forms) {
          const fl = await getFormLeads(f.id, 2000, pageToken);
          for (const ml of fl) metaCampaignById.set(ml.id, ml.campaignId);
        }
      } else {
        metaReadable = false;
      }
    } catch {
      metaReadable = false;
    }
  }

  const keepIds: string[] = [];
  const removeOff: typeof metaLeads = [];
  const removeUnverifiable: typeof metaLeads = [];
  const byCampaign = new Map<string, number>();

  for (const l of metaLeads) {
    // Prefer the locally-stamped campaign; fall back to what Meta reports.
    const cid =
      l.campaignId ??
      (l.metaLeadId ? metaCampaignById.get(l.metaLeadId) ?? undefined : undefined);
    if (cid !== undefined) {
      const key = cid ?? "(no campaign)";
      byCampaign.set(key, (byCampaign.get(key) ?? 0) + 1);
    }
    if (cid && keepCampaigns.has(cid)) {
      keepIds.push(l.id);
    } else if (cid !== undefined) {
      removeOff.push(l);
    } else if (metaReadable) {
      // We could read Meta but this lead wasn't in it — it's gone/too old.
      removeUnverifiable.push(l);
    } else {
      // Couldn't reach Meta at all: don't risk deleting; keep for now.
      keepIds.push(l.id);
    }
  }

  const removeLeads = [...removeOff, ...removeUnverifiable];
  const removeIds = removeLeads.map((l) => l.id);

  const summary = {
    agent: { id: agent.id, name: agent.name, brandId: agent.brandId },
    taggedCampaigns: [...keepCampaigns],
    total: leads.length,
    nonMeta, // referral/manual — always kept
    fromMeta: metaLeads.length,
    keep: keepIds.length + nonMeta,
    remove: removeIds.length,
    removeOffCampaign: removeOff.length,
    removeUnverifiable: removeUnverifiable.length,
    metaReadable,
    byCampaign: [...byCampaign.entries()]
      .map(([campaignId, count]) => ({
        campaignId,
        count,
        keep: keepCampaigns.has(campaignId),
      }))
      .sort((a, b) => b.count - a.count),
    sample: removeLeads.slice(0, 12).map((l) => ({
      name: l.name,
      adName: l.adName ?? null,
      receivedAt: l.receivedAt,
    })),
  };

  if (!confirm) {
    return NextResponse.json({ ok: true, dryRun: true, ...summary });
  }

  const removed = await deleteLeads(userId, removeIds);
  return NextResponse.json({ ok: true, dryRun: false, removed, ...summary });
}
