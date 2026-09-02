import "server-only";
import { appOrigin } from "./microsoft";

/* The platform's own emails.
 *
 * Kept as one file of plain template functions rather than a templating
 * dependency: there are three of them, they change rarely, and someone
 * non-technical can read and edit the copy here.
 *
 * Inline styles only, and a table for the button. Outlook ignores <style>
 * blocks and most flexbox, so anything clever renders as a broken mess in
 * exactly the client The Experts Group runs on.
 */

const BRAND = "#a72a35";
const INK = "#111827";
const MUTED = "#6b7280";

function shell(opts: { heading: string; body: string; preheader?: string }) {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f4f5;">
${
  opts.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${opts.preheader}</div>`
    : ""
}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;padding:36px 32px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;">
      <tr><td>
        <p style="margin:0 0 26px;font-size:13px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:${BRAND};">Launch Pad</p>
        <h1 style="margin:0 0 18px;font-size:23px;line-height:1.3;color:${INK};font-weight:600;">${opts.heading}</h1>
        ${opts.body}
      </td></tr>
    </table>
    <p style="margin:22px 0 0;font-size:12px;color:${MUTED};font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;">
      The Experts Group · Launch Pad
    </p>
  </td></tr>
</table>
</body></html>`;
}

function para(text: string) {
  return `<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#374151;">${text}</p>`;
}

// A table, not an <a> with padding — Outlook collapses the latter.
function button(href: string, label: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 8px;">
  <tr><td style="border-radius:9999px;background:${BRAND};">
    <a href="${href}" style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;">${label}</a>
  </td></tr>
</table>`;
}

function fallbackLink(href: string) {
  return `<p style="margin:14px 0 0;font-size:12px;line-height:1.6;color:${MUTED};">
  If the button doesn't work, copy this into your browser:<br>
  <span style="color:${MUTED};word-break:break-all;">${href}</span>
</p>`;
}

/* ── 1. New signup → the team ─────────────────────────────────────────────
   Deep-links to the customer's own record, so it's one click from "someone
   signed up" to seeing who. */
export function newSignupEmail(opts: {
  name: string;
  email: string;
  brandName: string;
  packageName?: string;
  userId: string;
}) {
  const link = `${appOrigin()}/admin?tab=people&agent=${encodeURIComponent(opts.userId)}`;
  return {
    subject: `New Launch Pad customer — ${opts.name} (${opts.brandName})`,
    html: shell({
      heading: "You've had a new paying customer",
      preheader: `${opts.name} — ${opts.brandName}`,
      body:
        // Only sent once payment has cleared (see lib/pending-signups.ts), so
        // it can say so plainly. It used to fire the moment someone reached
        // the card page, which is why the count never matched the money.
        para(
          `<strong>${opts.name}</strong> has paid and their Launch Pad account is live.`
        ) +
        `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0 4px;font-size:14px;color:#374151;">
          <tr><td style="padding:4px 18px 4px 0;color:${MUTED};">Business</td><td style="padding:4px 0;">${opts.brandName}</td></tr>
          <tr><td style="padding:4px 18px 4px 0;color:${MUTED};">Email</td><td style="padding:4px 0;">${opts.email}</td></tr>
          ${opts.packageName ? `<tr><td style="padding:4px 18px 4px 0;color:${MUTED};">Package</td><td style="padding:4px 0;">${opts.packageName}</td></tr>` : ""}
        </table>` +
        button(link, "Open their file") +
        fallbackLink(link),
    }),
  };
}

/* ── 2. Password reset ───────────────────────────────────────────────────── */
export function passwordResetEmail(opts: { name: string; link: string; hours: number }) {
  return {
    subject: "Reset your Launch Pad password",
    html: shell({
      heading: "Reset your password",
      preheader: "A link to set a new password",
      body:
        para(`Hi ${opts.name.split(" ")[0]},`) +
        para(
          "Someone asked to reset the password on your Launch Pad account. Use the button below to set a new one."
        ) +
        button(opts.link, "Set a new password") +
        fallbackLink(opts.link) +
        para(
          `<span style="color:${MUTED};font-size:13px;">This link works once and expires in ${opts.hours} hours. If you didn't ask for it you can ignore this email — your password won't change.</span>`
        ),
    }),
  };
}

/* ── 3. Invite for a pre-provisioned account ─────────────────────────────── */
export function inviteEmail(opts: {
  name: string;
  link: string;
  brandName: string;
  days: number;
}) {
  return {
    subject: "Your Launch Pad account is ready",
    html: shell({
      heading: "Your account is ready",
      preheader: "Choose a password and you're in — your ads are already connected",
      /* Leads with what's already been done FOR them, because that's the
         surprising part — the account exists, the ads are connected, and the
         only job is a password. Referrals used to be named here; they're
         switched off for the first release, so promising them in the very
         first email would be a broken promise on day one. */
      body:
        para(`Hi ${opts.name.split(" ")[0]},`) +
        para(
          // brandName carries its own "The", so it can't sit after "your".
          `Your Launch Pad account is ready. Every lead from your ads now lands here — so you can call them, log what happened and book the appraisal, all in one place.`
        ) +
        para(
          "Your ads are already connected, so there's nothing to set up. Choose a password and you're in — about a minute."
        ) +
        button(opts.link, "Set my password") +
        fallbackLink(opts.link) +
        para(
          `<span style="color:${MUTED};font-size:13px;">This link is just for you and expires in ${opts.days} days. If it runs out, ask and we'll send another.</span>`
        ),
    }),
  };
}

/* ── Admin-centre invite ─────────────────────────────────────────────────── */
export function adminInviteEmail(opts: {
  name: string;
  link: string;
  brandName: string;
  roleLabel: string;
  invitedBy: string;
  days: number;
}) {
  return {
    subject: `You've been given access to the Launch Pad admin centre`,
    html: shell({
      heading: "Your admin access is ready",
      preheader: `${opts.roleLabel} access for ${opts.brandName}`,
      body:
        para(`Hi ${opts.name.split(" ")[0]},`) +
        para(
          `${opts.invitedBy} has set you up with <strong>${opts.roleLabel}</strong> access to the Launch Pad admin centre for ${opts.brandName}. You'll be able to see every agent's ads, spend, leads and conversion rates in one place.`
        ) +
        para("Choose a password and you're in — about a minute.") +
        button(opts.link, "Set my password") +
        fallbackLink(opts.link) +
        para(
          `<span style="color:${MUTED};font-size:13px;">This link is just for you and expires in ${opts.days} days. If it runs out, ask and we'll send another.</span>`
        ),
    }),
  };
}
