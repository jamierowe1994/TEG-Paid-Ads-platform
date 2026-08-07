import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth";
import { sendPushToUser } from "@/lib/push";

export const dynamic = "force-dynamic";

/** Send YOURSELF a test push — proves the whole chain on the agent's own
 *  phone without waiting for a real lead. */
export async function POST(req: NextRequest) {
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!userId) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const r = await sendPushToUser(userId, {
    title: "Launch Pad",
    body: "Test alert — tap me and I should open your leads.",
    url: "/dashboard/leads",
    tag: "teg-test",
  });
  return NextResponse.json({ ok: r.sent > 0, ...r });
}
