import { NextRequest, NextResponse } from "next/server";
import {
  verifyPassword,
  createSessionToken,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth";
import { findByEmail, toPublic } from "@/lib/users-store";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");

  const user = await findByEmail(email);
  // Same message whether the email is unknown or the password is wrong, so we
  // don't leak which emails have accounts.
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.json(
      { error: "Incorrect email or password." },
      { status: 401 }
    );
  }

  const remember = body?.remember !== false; // default on
  const res = NextResponse.json({ user: toPublic(user) });
  res.cookies.set(
    SESSION_COOKIE,
    createSessionToken(user.id),
    sessionCookieOptions(remember)
  );
  return res;
}
