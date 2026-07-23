import { NextRequest, NextResponse } from "next/server";
import { requirePaidUser } from "@/lib/api-guard";
import { updateUser, toPublic } from "@/lib/users-store";

// Customer-side campaign actions at the review stage:
//   { action: "approve" }            — sign off, ready to go live
//   { action: "feedback", text }     — leave feedback for the team
export async function POST(req: NextRequest) {
  const guard = await requirePaidUser(req);
  if (guard.error) return guard.error;
  const user = guard.user;

  const body = await req.json().catch(() => null);
  const action = String(body?.action ?? "");

  if (action === "approve") {
    const updated = await updateUser(user.id, { campaignApproved: true });
    return NextResponse.json({ user: updated ? toPublic(updated) : null });
  }
  if (action === "feedback") {
    const text = String(body?.text ?? "").trim();
    if (!text) {
      return NextResponse.json({ error: "Feedback required" }, { status: 400 });
    }
    const updated = await updateUser(user.id, {
      campaignFeedback: [
        ...(user.campaignFeedback ?? []),
        { at: new Date().toISOString(), text },
      ],
    });
    return NextResponse.json({ user: updated ? toPublic(updated) : null });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
