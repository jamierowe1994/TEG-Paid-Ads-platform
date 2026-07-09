import { NextRequest, NextResponse } from "next/server";
import { logRexWebhook } from "@/lib/rex-webhook-log";

// Rex calls this directly (no admin session), so it can't send our admin
// bearer token — instead the URL registered in Rex carries a shared secret:
//   https://{app}/api/rex/webhook?token={REX_WEBHOOK_SECRET}
// Set REX_WEBHOOK_SECRET in Railway to any random string, then register
// that exact URL in Rex → Settings → Webhooks.
//
// This is step one: capture the raw payload so we can see Rex's real event
// shape (visible in Admin → Connections → Rex CRM) before building the
// stage-mapping logic that updates leads/referrals from it.
export async function POST(req: NextRequest) {
  const secret = process.env.REX_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "REX_WEBHOOK_SECRET isn't set — refusing unauthenticated webhooks." },
      { status: 503 }
    );
  }
  if (req.nextUrl.searchParams.get("token") !== secret) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  // Read as text first — a Request body can only be consumed once, so we
  // can't try .json() and fall back to .text() on failure.
  const raw = await req.text().catch(() => "");
  let body: unknown;
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    // Not JSON — capture the raw text so we can still see what Rex sent.
    body = { __raw: raw };
  }

  await logRexWebhook(body);

  return NextResponse.json({ ok: true });
}
