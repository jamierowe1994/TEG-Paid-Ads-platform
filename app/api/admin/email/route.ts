// Preview and test-send the platform's emails.
//
// Built so the copy can be iterated without emailing real agents to find out
// how it reads. Two things you can do:
//
//   GET  /api/admin/email?template=invite            → the rendered HTML
//   GET  /api/admin/email                            → what's available + transport
//   POST /api/admin/email  { template, to }          → send one, to one address
//
// The send deliberately takes an explicit `to` and sends to exactly that one
// address. It cannot be pointed at the agent list, and there is no "send to
// everyone" here — inviting people for real stays in /api/admin/send-invites,
// which is a separate, deliberate action.
//
// Super admin only.

import { NextRequest, NextResponse } from "next/server";
import { isSuperAdmin } from "@/lib/admin-auth";
import { inviteEmail, passwordResetEmail, newSignupEmail } from "@/lib/emails";
import { sendSystemEmail, canSendSystemEmail } from "@/lib/mailer";
import { resendConfigured } from "@/lib/resend";
import { systemMailboxConnected } from "@/lib/mailer";

export const dynamic = "force-dynamic";

/* Sample values, clearly fake. Real names would make a test send look like a
   real one in someone's inbox, which is exactly the confusion to avoid. */
const SAMPLE = {
  name: "Sam Reid",
  brandName: "The Lettings Experts",
  link: "https://launchpad.theexpertsgroup.co.uk/reset/sample-token-not-real?invite=1",
};

const TEMPLATES = {
  invite: {
    label: "Invite — 'your account is ready'",
    build: () =>
      inviteEmail({
        name: SAMPLE.name,
        link: SAMPLE.link,
        brandName: SAMPLE.brandName,
        days: 14,
      }),
  },
  reset: {
    label: "Password reset",
    build: () =>
      passwordResetEmail({ name: SAMPLE.name, link: SAMPLE.link, hours: 4 }),
  },
  signup: {
    label: "New signup notification (internal)",
    build: () =>
      newSignupEmail({
        name: SAMPLE.name,
        email: "sam.reid@example.com",
        brandName: SAMPLE.brandName,
        packageName: "Starter",
        userId: "sample",
      }),
  },
} as const;

type TemplateId = keyof typeof TEMPLATES;

function isTemplate(v: string): v is TemplateId {
  return Object.prototype.hasOwnProperty.call(TEMPLATES, v);
}

export async function GET(req: NextRequest) {
  if (!isSuperAdmin(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get("template");

  // No template asked for → tell them what's here and how it would go out.
  if (!id) {
    return NextResponse.json({
      transport: resendConfigured()
        ? "resend"
        : (await systemMailboxConnected())
          ? "microsoft"
          : "none",
      canSend: await canSendSystemEmail(),
      templates: Object.entries(TEMPLATES).map(([k, v]) => ({
        id: k,
        label: v.label,
        subject: v.build().subject,
      })),
    });
  }

  if (!isTemplate(id)) {
    return NextResponse.json({ error: `Unknown template '${id}'` }, { status: 400 });
  }

  // Rendered as real HTML so it can be eyeballed in a browser tab exactly as
  // an inbox would draw it.
  const mail = TEMPLATES[id].build();
  return new NextResponse(mail.html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export async function POST(req: NextRequest) {
  if (!isSuperAdmin(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const id = String((body as { template?: string })?.template ?? "");
  const to = String((body as { to?: string })?.to ?? "").trim();

  if (!isTemplate(id)) {
    return NextResponse.json({ error: `Unknown template '${id}'` }, { status: 400 });
  }
  if (!/^\S+@\S+\.\S+$/.test(to)) {
    return NextResponse.json(
      { error: "A single valid email address is required." },
      { status: 400 }
    );
  }

  const mail = TEMPLATES[id].build();
  const result = await sendSystemEmail({
    to,
    // Marked so a test can never be mistaken for the real thing in an inbox.
    subject: `[TEST] ${mail.subject}`,
    body: mail.html,
    html: true,
  });

  if (!result.sent) {
    return NextResponse.json(
      {
        sent: false,
        reason: result.reason,
        detail: result.detail,
        transport: resendConfigured() ? "resend" : "microsoft",
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    sent: true,
    to,
    transport: resendConfigured() ? "resend" : "microsoft",
  });
}
