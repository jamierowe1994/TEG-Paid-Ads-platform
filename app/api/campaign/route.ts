import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth";
import { findById, updateUser, toPublic } from "@/lib/users-store";

// Customer-side campaign actions at the review stage:
//   { action: "approve" }            — sign off, ready to go live
//   { action: "feedback", text }     — leave feedback for the team
export async function POST(req: NextRequest) {
  const id = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!id) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const user = await findById(id);
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const action = String(body?.action ?? "");

  if (action === "approve") {
    const updated = await updateUser(id, { campaignApproved: true });
    return NextResponse.json({ user: updated ? toPublic(updated) : null });
  }
  if (action === "feedback") {
    const text = String(body?.text ?? "").trim();
    if (!text) {
      return NextResponse.json({ error: "Feedback required" }, { status: 400 });
    }
    const updated = await updateUser(id, {
      campaignFeedback: [
        ...(user.campaignFeedback ?? []),
        { at: new Date().toISOString(), text },
      ],
    });
    return NextResponse.json({ user: updated ? toPublic(updated) : null });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
