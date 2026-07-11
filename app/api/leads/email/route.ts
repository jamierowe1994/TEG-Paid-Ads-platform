import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth";
import { getLead, addLeadNote } from "@/lib/leads-store";
import { findById } from "@/lib/users-store";
import {
  msAccessTokenFor,
  msSendMail,
  msConfigured,
  msForgetUser,
} from "@/lib/microsoft";

// Send a real email to a lead — as the agent, from their own connected
// Microsoft mailbox (it lands in their Sent items too). The send is recorded
// on the lead's notes so the timeline tells the story.
// Body: { leadId, subject, body }
export async function POST(req: NextRequest) {
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const payload = await req.json().catch(() => null);
  const leadId = String(payload?.leadId ?? "");
  const subject = String(payload?.subject ?? "").trim();
  const body = String(payload?.body ?? "").trim();
  if (!leadId || !subject || !body) {
    return NextResponse.json(
      { error: "leadId, subject and body are required" },
      { status: 400 }
    );
  }

  const [user, lead] = await Promise.all([
    findById(userId),
    getLead(userId, leadId),
  ]);
  if (!user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }
  if (!lead.email?.trim()) {
    return NextResponse.json(
      { error: "This lead has no email address." },
      { status: 400 }
    );
  }
  if (!msConfigured() || !user.msRefreshToken || !user.msEmail) {
    return NextResponse.json(
      { error: "Connect your email first (Profile → Email sending)." },
      { status: 400 }
    );
  }

  try {
    const token = await msAccessTokenFor(user);
    await msSendMail(token, {
      to: lead.email.trim(),
      subject,
      body,
    });
  } catch (e) {
    // Nothing was sent. Evict any cached token (it may be the stale culprit)
    // and translate auth-death into something a human can act on.
    msForgetUser(userId);
    const msg = e instanceof Error ? e.message : "Send failed";
    const expired = msg === "EMAIL_AUTH_EXPIRED" || /AADSTS|invalid_grant/i.test(msg);
    return NextResponse.json(
      {
        error: expired
          ? "Your email connection has expired — reconnect it from Profile → Email sending."
          : msg,
      },
      { status: 502 }
    );
  }

  // The email IS sent from here on — a note-write hiccup must not report
  // "send failed" (a retry would email the lead twice).
  let updated = lead;
  let noteSaved = true;
  try {
    updated = (await addLeadNote(userId, leadId, `Email sent — "${subject}"`)) ?? lead;
  } catch {
    noteSaved = false;
  }
  return NextResponse.json({ ok: true, lead: updated, noteSaved });
}
