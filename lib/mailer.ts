import "server-only";
import { getSystemMailbox, clearSystemMailbox } from "./system-mailbox";
import { msSendMail, msRefreshSystemToken } from "./microsoft";
import { resendConfigured, sendViaResend } from "./resend";

/* Sending on the platform's own behalf.
 *
 * Everything that isn't "an agent emailing their own lead" goes through here:
 * invite emails, password resets, admin notifications. It sends from the
 * system mailbox a super admin connected once, NOT from an agent's mailbox.
 *
 * Every caller must cope with this being unconfigured — the mailbox may not
 * be connected yet, and a signup must not fail because a notification
 * couldn't go out. So `sendSystemEmail` reports rather than throws.
 *
 * TWO TRANSPORTS, in order: Resend when it's configured, then the Microsoft
 * system mailbox. Resend is preferred because it doesn't need a paid mailbox
 * seat and doesn't depend on an OAuth grant that can silently expire.
 *
 * Microsoft is kept as a FALLBACK rather than replaced. These are password
 * resets and launch invites — the mail people need when they're locked out —
 * so a bad API key or an unverified domain shouldn't mean nothing sends at
 * all. If Resend fails for a reason that isn't "not configured", we say so in
 * the log and still try Microsoft.
 */

export type SendResult =
  | { sent: true }
  | { sent: false; reason: "not_connected" | "auth_expired" | "failed"; detail?: string };

export async function systemMailboxConnected(): Promise<boolean> {
  return !!(await getSystemMailbox());
}

/** True when SOMETHING can send — either transport. */
export async function canSendSystemEmail(): Promise<boolean> {
  return resendConfigured() || !!(await getSystemMailbox());
}

export async function sendSystemEmail(opts: {
  to: string;
  subject: string;
  body: string;
  html?: boolean;
}): Promise<SendResult> {
  let resendDetail: string | undefined;
  if (resendConfigured()) {
    const r = await sendViaResend(opts);
    if (r.sent) return { sent: true };
    // Don't swallow this. A Resend failure is nearly always a fixable config
    // problem (domain not verified, wrong key), and it would otherwise look
    // like Microsoft's fault — or like nothing happened at all.
    resendDetail = r.detail;
    console.error("[mailer] Resend failed, falling back to Microsoft:", r.detail);
  }

  const mailbox = await getSystemMailbox();
  if (!mailbox) {
    // REPORT WHAT ACTUALLY WENT WRONG. When Resend is configured but failing
    // and Microsoft was never connected, this used to return "not_connected" —
    // which reads as "no email transport set up" and sends whoever is pressing
    // Send All chasing the wrong problem entirely. The real cause ("API key is
    // invalid", "domain not verified") was console-only, where an MD can't see
    // it. Both are fixable in minutes, but only if they're named.
    return resendDetail
      ? { sent: false, reason: "failed", detail: `Resend: ${resendDetail}` }
      : { sent: false, reason: "not_connected" };
  }

  try {
    const accessToken = await msRefreshSystemToken(mailbox.refreshToken);
    await msSendMail(accessToken, opts);
    return { sent: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // The grant is gone (revoked in Azure, password reset, consent removed).
    // Drop the dead token so the admin UI shows "not connected" rather than
    // silently failing every send from now on.
    if (message === "EMAIL_AUTH_EXPIRED" || /invalid_grant/i.test(message)) {
      await clearSystemMailbox();
      console.error("[mailer] system mailbox grant expired — disconnected");
      return { sent: false, reason: "auth_expired" };
    }

    console.error("[mailer] send failed:", message);
    return {
      sent: false,
      reason: "failed",
      detail: resendDetail ? `Resend: ${resendDetail}; Microsoft: ${message}` : message,
    };
  }
}
