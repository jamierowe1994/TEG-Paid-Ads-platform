import "server-only";

/* Resend — the platform's own outbound mail.
 *
 * Used for what Launch Pad sends on its OWN behalf: launch invites, password
 * reset links, admin notifications. NOT for an agent emailing their own lead —
 * that still goes from the agent's own Microsoft mailbox, because it's personal
 * correspondence and should come from the person, not from a platform address.
 *
 * Implemented against Resend's HTTP API rather than their npm package: it's one
 * POST, so a dependency would be more surface area than the thing it replaces.
 *
 * SEND FROM A SUBDOMAIN (send.theexpertsgroup.co.uk), never the root domain.
 * The root already sends through Microsoft 365, so its SPF record lists
 * Microsoft. SPF allows only 10 DNS lookups, and adding Resend's include on top
 * can tip it over — at which point SPF fails for the WHOLE domain, taking
 * ordinary company email with it. A subdomain has its own SPF and its own
 * reputation, so neither can damage the other.
 *
 * REPLY-TO MATTERS: Resend cannot receive mail. Without a reply-to pointing at
 * a real mailbox, anyone replying to a launch invite ("I can't get in") is
 * talking to nobody.
 */

export function resendConfigured(): boolean {
  return !!(process.env.RESEND_API_KEY && process.env.RESEND_FROM);
}

/** Where replies go. Resend has no inbox, so this must be a real mailbox. */
function replyTo(): string | undefined {
  return process.env.RESEND_REPLY_TO || undefined;
}

export type ResendResult =
  | { sent: true; id?: string }
  | { sent: false; detail: string };

export async function sendViaResend(opts: {
  to: string;
  subject: string;
  body: string;
  html?: boolean;
}): Promise<ResendResult> {
  if (!resendConfigured()) return { sent: false, detail: "not_configured" };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM,
        to: [opts.to],
        subject: opts.subject,
        ...(opts.html ? { html: opts.body } : { text: opts.body }),
        ...(replyTo() ? { reply_to: replyTo() } : {}),
      }),
    });

    const data = (await res.json().catch(() => null)) as {
      id?: string;
      message?: string;
      name?: string;
    } | null;

    if (!res.ok) {
      // Resend puts the useful part in `message` — surface it, because the
      // common failures (domain not verified, key wrong) are all fixable and
      // all indistinguishable from "it didn't work" without the detail.
      return {
        sent: false,
        detail: data?.message ?? `Resend returned ${res.status}`,
      };
    }
    return { sent: true, id: data?.id };
  } catch (err) {
    return {
      sent: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
