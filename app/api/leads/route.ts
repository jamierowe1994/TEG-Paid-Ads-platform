import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth";
import { listLeadsForUser, updateLeadStage } from "@/lib/leads-store";
import { syncReferralFromLead } from "@/lib/referrals-store";
import { findById } from "@/lib/users-store";
import { pushLeadToGhl, ghlConfigured } from "@/lib/ghl";
import type { LeadStage } from "@/lib/types";

// The signed-in agent's leads. Server-side now (Postgres on Railway) — the
// Meta lead webhook will insert into the same store when it goes live.

const STAGES: LeadStage[] = [
  "new",
  "attempt1",
  "attempt2",
  "attempt3",
  "nurture",
  "converted",
  "pushed",
  "lost",
];

function userIdFrom(req: NextRequest): string | null {
  return verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
}

export async function GET(req: NextRequest) {
  const userId = userIdFrom(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  return NextResponse.json(await listLeadsForUser(userId));
}

// Move a lead through the funnel: { leadId, stage }
export async function PATCH(req: NextRequest) {
  const userId = userIdFrom(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const leadId = String(body?.leadId ?? "");
  const stage = String(body?.stage ?? "") as LeadStage;
  if (!leadId || !STAGES.includes(stage)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const lead = await updateLeadStage(userId, leadId, stage);
  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }
  // If this lead came from a referral, mirror the progress back to the
  // referrer so they can see what happened to the lead they sent.
  if (lead.referralId) {
    await syncReferralFromLead(lead.id, stage);
  }

  // Entering the marketing/nurture funnel is the ONE moment a lead flows into
  // GoHighLevel — tagged so a nurture workflow there can pick it up. Best-
  // effort: a GHL hiccup (or no config) must never fail the stage change.
  if (stage === "nurture") {
    try {
      const user = await findById(userId);
      const brandId = user?.brandId;
      if (ghlConfigured(brandId)) {
        await pushLeadToGhl(
          lead,
          ["nurture", `brand:${brandId ?? "unknown"}`],
          brandId
        );
      }
    } catch {
      /* the lead is already in the nurture stage; GHL sync is best-effort */
    }
  }

  return NextResponse.json(lead);
}
