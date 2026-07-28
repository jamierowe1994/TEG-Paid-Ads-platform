import { NextRequest, NextResponse } from "next/server";
import { findByEmail } from "@/lib/users-store";
import { createAuthToken } from "@/lib/auth-tokens";
import { sendSystemEmail } from "@/lib/mailer";
import { passwordResetEmail } from "@/lib/emails";
import { appOrigin } from "@/lib/microsoft";
import { requestPasswordReset } from "@/lib/password-requests";

const TTL_HOURS = 2;

/* "Forgot your password" — send a one-time link.
 *
 * ALWAYS returns the same success response, whether or not the address has an
 * account. Telling a stranger "no account with that email" hands them a way
 * to enumerate who works here.
 *
 * The existing admin request queue is still written to, so if the mailbox
 * isn't connected yet a human can still see who's locked out and help.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = String(body?.email ?? "").trim().toLowerCase();

  const ok = NextResponse.json({
    ok: true,
    message: "If that email has an account, a reset link is on its way.",
  });
  if (!/^\S+@\S+\.\S+$/.test(email)) return ok;

  const user = await findByEmail(email);
  if (!user || user.deactivatedAt) return ok;

  await requestPasswordReset(email).catch(() => {});

  const token = await createAuthToken(user.id, "reset", TTL_HOURS * 3600_000);
  const link = `${appOrigin()}/reset/${token}`;
  const mail = passwordResetEmail({
    name: user.name,
    link,
    hours: TTL_HOURS,
  });
  await sendSystemEmail({
    to: user.email,
    subject: mail.subject,
    body: mail.html,
    html: true,
  });

  return ok;
}
