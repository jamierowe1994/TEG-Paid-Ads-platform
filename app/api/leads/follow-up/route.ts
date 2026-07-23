import { NextRequest, NextResponse } from "next/server";
import { requirePaidUser } from "@/lib/api-guard";
import { setLeadFollowUp } from "@/lib/leads-store";

// Set (or clear) a lead's follow-up date — the reminder. The lead hibernates
// until then and reappears in the Follow-ups box on the day, keeping its stage
// throughout (so this never sends anyone to the nurture funnel).
// Body: { leadId, at (ISO date) | null }
export async function POST(req: NextRequest) {
  const guard = await requirePaidUser(req);
  if (guard.error) return guard.error;
  const userId = guard.user.id;
  const body = await req.json().catch(() => null);
  const leadId = String(body?.leadId ?? "");
  const at = body?.at ? String(body.at) : null;
  if (!leadId) {
    return NextResponse.json({ error: "leadId required" }, { status: 400 });
  }
  if (at && Number.isNaN(new Date(at).getTime())) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }
  if (at && new Date(at).getTime() <= Date.now()) {
    return NextResponse.json(
      { error: "Pick a follow-up date in the future." },
      { status: 400 }
    );
  }

  const label = at
    ? `Follow-up set for ${new Date(at).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })}`
    : "Follow-up cleared — back in your list now";
  const lead = await setLeadFollowUp(userId, leadId, at, label);
  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, lead });
}
