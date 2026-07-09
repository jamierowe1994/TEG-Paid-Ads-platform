import { NextRequest, NextResponse } from "next/server";
import { findById } from "@/lib/users-store";
import { sendLeadNudge } from "@/lib/whatsapp";

function authorised(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const password = process.env.ADMIN_PASSWORD ?? "experts-admin";
  return auth === `Bearer ${password}`;
}

// Admin nudge: prompt an agent (by WhatsApp) to go back to a lead that's
// going cold. Returns a clear outcome so the admin UI can toast it.
export async function POST(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const userId = String(body?.userId ?? "");
  const leadName = String(body?.leadName ?? "").trim();
  if (!userId) {
    return NextResponse.json({ error: "Missing agent" }, { status: 400 });
  }
  const user = await findById(userId);
  if (!user) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }
  if (!user.mobile) {
    return NextResponse.json({ ok: false, reason: "no_mobile" });
  }
  const result = await sendLeadNudge({
    toMobile: user.mobile,
    agentName: user.name,
    leadName,
  });
  return NextResponse.json({ ...result, agentName: user.name });
}
