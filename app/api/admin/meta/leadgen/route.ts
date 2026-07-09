import { NextRequest, NextResponse } from "next/server";
import { getLeadgenForms, getFormLeads, mapLeadFields } from "@/lib/meta";
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
// own lead counts); POST pulls a form's leads and creates them against a
// chosen agent, skipping any already imported (matched on Meta's lead id).

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

export async function POST(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const brandId = String(body?.brandId ?? "");
  const formId = String(body?.formId ?? "");
  const agentUserId = String(body?.agentUserId ?? "");
  if (!brandId || !formId || !agentUserId) {
    return NextResponse.json(
      { error: "brandId, formId and agentUserId are required" },
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

  try {
    const metaLeads = await getFormLeads(formId);
    let imported = 0;
    let skipped = 0;
    for (const ml of metaLeads) {
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
    return NextResponse.json({
      ok: true,
      imported,
      skipped,
      total: metaLeads.length,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Meta request failed" },
      { status: 502 }
    );
  }
}
