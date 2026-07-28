import "server-only";
import { getSystemMailbox, clearSystemMailbox } from "./system-mailbox";
import { msSendMail, msRefreshSystemToken } from "./microsoft";

/* Sending on the platform's own behalf.
 *
 * Everything that isn't "an agent emailing their own lead" goes through here:
 * invite emails, password resets, admin notifications. It sends from the
 * system mailbox a super admin connected once, NOT from an agent's mailbox.
 *
 * Every caller must cope with this being unconfigured — the mailbox may not
 * be connected yet, and a signup must not fail because a notification
 * couldn't go out. So `sendSystemEmail` reports rather than throws.
 */

export type SendResult =
  | { sent: true }
  | { sent: false; reason: "not_connected" | "auth_expired" | "failed"; detail?: string };

export async function systemMailboxConnected(): Promise<boolean> {
  return !!(await getSystemMailbox());
}

export async function sendSystemEmail(opts: {
  to: string;
  subject: string;
  body: string;
  html?: boolean;
}): Promise<SendResult> {
  const mailbox = await getSystemMailbox();
  if (!mailbox) return { sent: false, reason: "not_connected" };

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
    return { sent: false, reason: "failed", detail: message };
  }
}
