import { NextRequest, NextResponse } from "next/server";
import { sendWhatsAppTest } from "@/lib/whatsapp";

function authorised(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const password = process.env.ADMIN_PASSWORD ?? "experts-admin";
  return auth === `Bearer ${password}`;
}

// Fires the real new_lead template at a chosen number — the one-click proof
// that the whole WhatsApp chain (token, registered number, approved template,
// delivery) works. Body: { mobile }.
export async function POST(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const mobile = String(body?.mobile ?? "").trim();
  if (!mobile) {
    return NextResponse.json({ error: "mobile required" }, { status: 400 });
  }
  const result = await sendWhatsAppTest(mobile);
  return NextResponse.json(result);
}
