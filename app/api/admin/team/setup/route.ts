import { NextRequest, NextResponse } from "next/server";
import { peekAuthToken, consumeAuthToken } from "@/lib/auth-tokens";
import { findAdminUserById, setAdminPassword, touchAdminLogin } from "@/lib/admin-users";
import { hashPassword } from "@/lib/auth";
import { loginResultFor } from "@/lib/admin-auth";
import { brandById } from "@/lib/brands";

/* Where an admin invite link lands.
 *
 * GET  ?token=…          → is this link good, and who is it for? (Doesn't
 *                          burn it — the page needs to show a form first.)
 * POST { token, password } → set the password, burn the link, and return a
 *                          signed-in admin session so they go straight in.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const id = token ? await peekAuthToken(token, "admin-invite") : null;
  const admin = id ? await findAdminUserById(id) : null;
  if (!admin) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }
  return NextResponse.json({
    ok: true,
    name: admin.name,
    email: admin.email,
    brandName: admin.brandId ? (brandById(admin.brandId)?.name ?? admin.brandId) : "The Experts Group",
    role: admin.role,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const token = String(body?.token ?? "");
  const password = String(body?.password ?? "");
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 }
    );
  }
  const id = token ? await consumeAuthToken(token, "admin-invite") : null;
  const admin = id ? await findAdminUserById(id) : null;
  if (!admin) {
    return NextResponse.json(
      { error: "That link has expired or already been used." },
      { status: 410 }
    );
  }
  await setAdminPassword(admin.id, hashPassword(password));
  await touchAdminLogin(admin.id);
  return NextResponse.json({ ok: true, ...loginResultFor(admin) });
}
