import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { markWhatsAppStatus } from "@/lib/whatsapp-log";

/* Meta's WhatsApp status webhook — the only source of REAL delivery data.
 *
 * Without this, the monitoring tab can say "Meta accepted the message" and
 * nothing more. Accepted is not delivered: a wrong number, a blocked
 * business, or a handset that never comes online all look like a clean send
 * from the API's side. This endpoint stamps delivered / read / failed back
 * onto the log row by message id.
 *
 * Setup (Meta → WhatsApp → Configuration → Webhooks), one step at a time:
 *   1. Set WHATSAPP_VERIFY_TOKEN in Railway to any random string.
 *   2. Callback URL: https://launchpad.theexpertsgroup.co.uk/api/webhooks/whatsapp
 *   3. Verify token: the same string.
 *   4. Subscribe to the "messages" field.
 * Set WHATSAPP_APP_SECRET too and every delivery is signature-checked.
 *
 * Until step 1 is done this endpoint refuses everything, so it can ship
 * ahead of the config without being an open door.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Meta's subscription handshake: echo hub.challenge when the token matches.
export async function GET(req: NextRequest) {
  const verify = process.env.WHATSAPP_VERIFY_TOKEN;
  if (!verify) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  const p = req.nextUrl.searchParams;
  if (p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === verify) {
    return new NextResponse(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

/* Meta signs the RAW body with the app secret. Checked with a timing-safe
   compare, and only when the secret is set — an unset secret leaves the
   verify-token gate as the only guard, which is Meta's own minimum. */
function signatureOk(raw: string, header: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return true;
  if (!header?.startsWith("sha256=")) return false;
  const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const got = header.slice("sha256=".length);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(got, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

interface StatusEntry {
  id?: string;
  status?: string;
  errors?: { title?: string; message?: string; error_data?: { details?: string } }[];
}

export async function POST(req: NextRequest) {
  if (!process.env.WHATSAPP_VERIFY_TOKEN) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  const raw = await req.text();
  if (!signatureOk(raw, req.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "Bad signature" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Bad body" }, { status: 400 });
  }

  const entries =
    (body as { entry?: { changes?: { value?: { statuses?: StatusEntry[] } }[] }[] })
      .entry ?? [];

  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      for (const s of change.value?.statuses ?? []) {
        if (!s.id || !s.status) continue;
        const status = s.status.toLowerCase();
        if (!["sent", "delivered", "read", "failed"].includes(status)) continue;
        const err = s.errors?.[0];
        await markWhatsAppStatus(
          s.id,
          status as "sent" | "delivered" | "read" | "failed",
          err ? (err.error_data?.details ?? err.message ?? err.title ?? null) ?? undefined : undefined
        );
      }
    }
  }

  // Always 200: a non-200 makes Meta retry, and a status we couldn't match is
  // not worth replaying.
  return NextResponse.json({ received: true });
}
