import { NextRequest, NextResponse } from "next/server";
import { verifyAdminLogin } from "@/lib/admin-auth";

// Admin sign-in: a directory email decides the tier and is checked against
// that tier's shared secret; anyone else is looked up as an invited admin
// with their own password. Returns a bearer token + role/brand for the UI.
// Body: { email, password }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = String(body?.email ?? "");
  const password = String(body?.password ?? "");
  const result = await verifyAdminLogin(email, password);
  if (!result) {
    return NextResponse.json(
      { error: "That email and password don't match an admin account." },
      { status: 401 }
    );
  }
  return NextResponse.json({ ok: true, ...result });
}
