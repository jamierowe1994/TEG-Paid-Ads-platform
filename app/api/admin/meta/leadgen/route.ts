import { NextRequest, NextResponse } from "next/server";
import {
  getLeadgenForms,
  getFormLeads,
  getPageAccessToken,
  mapLeadFields,
  parseCampaignIds,
  resolveCampaignIds,
} from "@/lib/meta";
import { createLead, uid } from "@/lib/leads-store";
import { findById } from "@/lib/users-store";
import type { Lead } from "@/lib/types";

function authorised(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const password = process.env.ADMIN_PASSWORD ?? "experts-admin";
  return auth === `Bearer ${password}`;
}

// One-off historic backfill from Meta's Instant Form leadgen API — separate
// from the live Insights connection. GET lists a brand's forms (with Meta's
// own lead counts); POST imports a form's leads (or every form on the brand's
// Page, when formId is omitted) into a chosen agent, skipping any already
// imported (matched on Meta's lead id) — safe to run more than once.

export async function GET(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const brandId = req.nextUrl.searchParams.get("brand");
  if (!brandId) {
    return NextResponse.json({ error: "brand is required" }, { status: 400 });
  }
  try {
    const forms = await getLeadgenForms(brandId);
    if (forms === null) {
      return NextResponse.json(
        { error: "No Meta Page configured for this brand yet." },
        { status: 400 }
      );
    }
    return NextResponse.json({ forms });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Meta request failed" },
      { status: 502 }
    );
  }
}

async function importForm(
  formId: string,
  agentUserId: string,
  campaignIds: Set<string>,
  pageToken?: string
): Promise<{ imported: number; skipped: number; total: number; skippedOffCampaign: number }> {
  const metaLeads = await getFormLeads(formId, 2000, pageToken);
  let imported = 0;
  let skipped = 0;
  let skippedOffCampaign = 0;
  for (const ml of metaLeads) {
    // Only pull a lead that came from a campaign this agent has tagged. A
    // brand's Page hosts forms from every region/campaign; without this filter
    // one "import all forms" pull sweeps the whole Page into one agent (the
    // 600+-lead over-capture).
    if (!ml.campaignId || !campaignIds.has(ml.campaignId)) {
      skippedOffCampaign++;
      continue;
    }
    const { name, phone, email, extra } = mapLeadFields(ml.fields);
    const lead: Lead = {
      id: uid(),
      name,
      phone,
      email,
      source: ml.platform === "ig" ? "instagram" : "facebook",
      note: extra || "Imported from a historic Meta Instant Form",
      stage: "new",
      receivedAt: new Date(ml.createdTime).toISOString(),
      history: [{ stage: "new", at: new Date(ml.createdTime).toISOString() }],
      adName: ml.adName,
      metaLeadId: ml.id,
    };
    const inserted = await createLead(agentUserId, lead, { notify: false });
    if (inserted) imported++;
    else skipped++;
  }
  return { imported, skipped, total: metaLeads.length, skippedOffCampaign };
}

// Body: { brandId, agentUserId, formId? }. Omit formId to pull every form on
// the brand's Page in one go — this is what the agent-profile "Find older
// leads" button uses.
export async function POST(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const brandId = String(body?.brandId ?? "");
  const formId = body?.formId ? String(body.formId) : null;
  const agentUserId = String(body?.agentUserId ?? "");
  if (!brandId || !agentUserId) {
    return NextResponse.json(
      { error: "brandId and agentUserId are required" },
      { status: 400 }
    );
  }

  const agent = await findById(agentUserId);
  if (!agent || agent.brandId !== brandId) {
    return NextResponse.json(
      { error: "That agent isn't part of this brand." },
      { status: 400 }
    );
  }

  // Backfill routes STRICTLY by the agent's tagged campaigns — otherwise an
  // "import all forms" pull captures the whole Page. No tags → nothing to pull.
  const tagged = parseCampaignIds(agent.metaCampaignId);
  if (tagged.length === 0) {
    return NextResponse.json(
      {
        error:
          "Tag this agent's Meta campaign(s) first — backfill only imports leads from their own campaigns.",
      },
      { status: 400 }
    );
  }
  const campaignIds = new Set(await resolveCampaignIds(tagged));

  try {
    const pageToken = (await getPageAccessToken(brandId)) ?? undefined;
    if (formId) {
      const result = await importForm(formId, agentUserId, campaignIds, pageToken);
      return NextResponse.json({ ok: true, forms: 1, ...result });
    }

    const forms = await getLeadgenForms(brandId);
    if (forms === null) {
      return NextResponse.json(
        { error: "No Meta Page configured for this brand yet." },
        { status: 400 }
      );
    }
    if (forms.length === 0) {
      return NextResponse.json({
        ok: true,
        forms: 0,
        imported: 0,
        skipped: 0,
        total: 0,
      });
    }
    let imported = 0;
    let skipped = 0;
    let total = 0;
    let skippedOffCampaign = 0;
    for (const f of forms) {
      const r = await importForm(f.id, agentUserId, campaignIds, pageToken);
      imported += r.imported;
      skipped += r.skipped;
      total += r.total;
      skippedOffCampaign += r.skippedOffCampaign;
    }
    return NextResponse.json({
      ok: true,
      forms: forms.length,
      imported,
      skipped,
      total,
      skippedOffCampaign,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Meta request failed" },
      { status: 502 }
    );
  }
}
