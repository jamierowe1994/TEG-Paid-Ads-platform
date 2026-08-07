import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth";
import { vapidPublicKey } from "@/lib/push";

export const dynamic = "force-dynamic";

/** The VAPID public key the browser needs to subscribe. Session required —
 *  the key isn't secret, but there's no reason to hand it to the world. */
export async function GET(req: NextRequest) {
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!userId) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  return NextResponse.json({ key: await vapidPublicKey() });
}
