import { NextRequest, NextResponse } from "next/server";
import { findByEmail, updateUser } from "@/lib/users-store";

// Base44 is the group's source of truth for who works here. When someone
// leaves, Base44 fires this webhook and we deactivate their portal account:
// they can no longer sign in, but the record (and their lead history) stays.
//
// Setup on the Base44 side: POST to
//   https://launchpad.theexpertsgroup.co.uk/api/webhooks/base44
// with header  x-webhook-secret: <BASE44_WEBHOOK_SECRET>
// and body     { "event": "account.deleted", "email": "person@brand.co.uk" }
//
// "account.restored" re-activates (someone removed by mistake).
// Where a deactivated account's incoming leads should go instead is TODO.md
// item 5 (per-brand fallback addresses) — not handled here yet.

export async function POST(req: NextRequest) {
  const secret = process.env.BASE44_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Webhook not configured (BASE44_WEBHOOK_SECRET missing)" },
      { status: 503 }
    );
  }
  if (req.headers.get("x-webhook-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const event = String(body?.event ?? "");
  const email = String(body?.email ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Missing email" }, { status: 400 });
  }

  const user = await findByEmail(email);
  if (!user) {
    // Not an error from Base44's point of view — they may delete people who
    // never had a portal account. Acknowledge so it doesn't retry forever.
    return NextResponse.json({ ok: true, matched: false });
  }

  if (event === "account.deleted") {
    await updateUser(user.id, { deactivatedAt: new Date().toISOString() });
    return NextResponse.json({ ok: true, matched: true, deactivated: true });
  }
  if (event === "account.restored") {
    await updateUser(user.id, { deactivatedAt: null });
    return NextResponse.json({ ok: true, matched: true, deactivated: false });
  }
  return NextResponse.json({ error: `Unknown event "${event}"` }, { status: 400 });
}
