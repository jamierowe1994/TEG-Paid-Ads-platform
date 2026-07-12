import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth";
import { setCancelRequested, toPublic } from "@/lib/users-store";

// The agent requests (or resumes) cancellation of their subscription. Without
// live card billing yet this just flags the account — the plan stays active
// and the team is notified. Body: { cancel: boolean }
export async function POST(req: NextRequest) {
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const cancel = body?.cancel !== false; // default: request cancellation
  const user = await setCancelRequested(
    userId,
    cancel ? new Date().toISOString() : null
  );
  if (!user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, user: toPublic(user) });
}
