import { NextRequest, NextResponse } from "next/server";
import {
  verifyPassword,
  createSessionToken,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth";
import { findByEmail, toPublic } from "@/lib/users-store";
import { isAllowedEmailDomain } from "@/lib/brands";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");

  // Staff-only portal: even if a non-Experts-Group account somehow exists
  // (e.g. created before the domain gate), it can never sign in. This is the
  // backstop behind the signup gate.
  if (!isAllowedEmailDomain(email)) {
    return NextResponse.json(
      { error: "Staff only — use your Experts Group work email.", code: "domain" },
      { status: 403 }
    );
  }

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
