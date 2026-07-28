import { NextRequest, NextResponse } from "next/server";
import { hashPassword, createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { findById, updateUser, toPublic } from "@/lib/users-store";
import { consumeAuthToken } from "@/lib/auth-tokens";
import { markPasswordRequestHandled } from "@/lib/password-requests";

/* Redeem a reset or invite link and set a new password.
 * Body: { token, password, purpose? }
 *
 * The token is burned before the password is written, so a link can't be
 * replayed. On success the user is signed in — having just proved control of
 * the mailbox, making them log in again immediately is pure friction.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const token = String(body?.token ?? "");
  const password = String(body?.password ?? "");
  const purpose = body?.purpose === "invite" ? "invite" : "reset";

  if (password.length < 8) {
    return NextResponse.json(
      { error: "Use at least 8 characters." },
      { status: 400 }
    );
  }

  const userId = await consumeAuthToken(token, purpose);
  if (!userId) {
    return NextResponse.json(
      { error: "That link has expired or has already been used." },
      { status: 400 }
    );
  }

  const user = await findById(userId);
  if (!user || user.deactivatedAt) {
    return NextResponse.json({ error: "That account isn't active." }, { status: 400 });
  }

  const updated = await updateUser(userId, {
    passwordHash: hashPassword(password),
    // Clears the first-sign-in gate for bulk-imported accounts.
    mustResetPassword: false,
  });
  if (!updated) {
    return NextResponse.json({ error: "Couldn't set your password." }, { status: 500 });
  }
  await markPasswordRequestHandled(user.email).catch(() => {});

  const res = NextResponse.json({ ok: true, user: toPublic(updated) });
  res.cookies.set(
    SESSION_COOKIE,
    createSessionToken(updated.id),
    sessionCookieOptions()
  );
  return res;
}
