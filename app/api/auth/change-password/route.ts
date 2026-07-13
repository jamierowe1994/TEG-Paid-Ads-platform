import { NextRequest, NextResponse } from "next/server";
import {
  verifySessionToken,
  SESSION_COOKIE,
  verifyPassword,
  hashPassword,
} from "@/lib/auth";
import { findById, updateUser } from "@/lib/users-store";

// The agent changes their own password — must prove the current one first.
// Body: { current, next }
export async function POST(req: NextRequest) {
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const current = String(body?.current ?? "");
  const next = String(body?.next ?? "");
  if (next.length < 8) {
    return NextResponse.json(
      { error: "Your new password must be at least 8 characters." },
      { status: 400 }
    );
  }

  const user = await findById(userId);
  if (!user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  if (!verifyPassword(current, user.passwordHash)) {
    return NextResponse.json(
      { error: "Your current password isn't right." },
      { status: 400 }
    );
  }
  if (verifyPassword(next, user.passwordHash)) {
    return NextResponse.json(
      { error: "That's already your password — pick a new one." },
      { status: 400 }
    );
  }

  await updateUser(userId, { passwordHash: hashPassword(next) });
  return NextResponse.json({ ok: true });
}
