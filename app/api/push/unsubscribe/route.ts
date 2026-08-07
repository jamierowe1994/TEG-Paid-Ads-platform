import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth";
import { removeSubscription } from "@/lib/push";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!userId) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const endpoint = String(body?.endpoint ?? "");
  if (endpoint) await removeSubscription(endpoint);
  return NextResponse.json({ ok: true });
}
