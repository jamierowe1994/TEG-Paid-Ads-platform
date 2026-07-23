import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE, hashPassword } from "@/lib/auth";
import { findById, updateUser, toPublic } from "@/lib/users-store";

// First-sign-in password set for pre-provisioned (bulk-imported) accounts.
// Only works while mustResetPassword is on — the account just proved it holds
// the shared launch password by signing in, so we don't ask for it again.
// Everyone else changes passwords through /api/auth/change-password (which
// requires the current one).
export async function POST(req: NextRequest) {
  const id = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!id) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const user = await findById(id);
  if (!user || user.deactivatedAt) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  if (!user.mustResetPassword) {
    return NextResponse.json(
      { error: "This account has already set its password." },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => null);
  const password = String(body?.password ?? "");
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Pick a password of at least 8 characters." },
      { status: 400 }
    );
  }

  const updated = await updateUser(user.id, {
    passwordHash: hashPassword(password),
    mustResetPassword: false,
  });
  if (!updated) {
    return NextResponse.json({ error: "Couldn't save" }, { status: 500 });
  }
  return NextResponse.json({ user: toPublic(updated) });
}
