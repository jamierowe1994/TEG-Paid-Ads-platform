import { NextRequest, NextResponse } from "next/server";
import { requirePaidUser } from "@/lib/api-guard";
import { snoozeLead } from "@/lib/leads-store";
import { syncReferralFromLead } from "@/lib/referrals-store";

// "Save for a later date" — archives the lead with a comeback date; the
// background sync resurfaces it as a new lead when the date arrives.
// Body: { leadId, until (ISO date), reason }
export async function POST(req: NextRequest) {
  const guard = await requirePaidUser(req);
  if (guard.error) return guard.error;
  const userId = guard.user.id;
  const body = await req.json().catch(() => null);
  const leadId = String(body?.leadId ?? "");
  const until = String(body?.until ?? "");
  const reason = String(body?.reason ?? "").trim() || "Not the right time";
  if (!leadId || !until || Number.isNaN(new Date(until).getTime())) {
    return NextResponse.json(
      { error: "leadId and a valid until date are required" },
      { status: 400 }
    );
  }
  if (new Date(until).getTime() <= Date.now()) {
    return NextResponse.json(
      { error: "The comeback date needs to be in the future." },
      { status: 400 }
    );
  }
  const lead = await snoozeLead(userId, leadId, until, reason);
  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }
  // Mirror the stage move to the referral that sent this lead, if any — the
  // referrer sees "marketing funnel" rather than frozen progress.
  if (lead.referralId) await syncReferralFromLead(leadId, "nurture");
  return NextResponse.json({ ok: true, lead });
}
