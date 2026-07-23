import { NextRequest, NextResponse } from "next/server";
import { requirePaidUser } from "@/lib/api-guard";
import {
  listLeadsForUser,
  updateLeadStage,
  setLeadFollowUp,
} from "@/lib/leads-store";
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

export async function GET(req: NextRequest) {
  const guard = await requirePaidUser(req);
  if (guard.error) return guard.error;
  return NextResponse.json(await listLeadsForUser(guard.user.id));
}

// Move a lead through the funnel: { leadId, stage }
export async function PATCH(req: NextRequest) {
  const guard = await requirePaidUser(req);
  if (guard.error) return guard.error;
  const userId = guard.user.id;
  const body = await req.json().catch(() => null);
  const leadId = String(body?.leadId ?? "");
  const stage = String(body?.stage ?? "") as LeadStage;
  if (!leadId || !STAGES.includes(stage)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  let lead = await updateLeadStage(userId, leadId, stage);
  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  // A logged contact attempt rests the lead until tomorrow — it drops out of
  // the working boxes and comes back in Follow-ups the next day for the next
  // try. The stage stays put, so this never touches the nurture funnel.
  if (stage === "attempt1" || stage === "attempt2" || stage === "attempt3") {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(8, 0, 0, 0);
    lead =
      (await setLeadFollowUp(
        userId,
        leadId,
        tomorrow.toISOString(),
        "Resting until tomorrow — back in your follow-ups"
      )) ?? lead;
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
