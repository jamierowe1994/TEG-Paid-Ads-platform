import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth";
import { saveSubscription } from "@/lib/push";

export const dynamic = "force-dynamic";

/** Store this device's push subscription against the signed-in agent. */
export async function POST(req: NextRequest) {
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!userId) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const sub = body?.subscription;
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    return NextResponse.json({ error: "Not a push subscription." }, { status: 400 });
  }
  await saveSubscription(userId, sub);
  return NextResponse.json({ ok: true });
}
