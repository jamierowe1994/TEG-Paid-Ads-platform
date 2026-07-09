import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth";
import { getLead, resetLeadFromRex } from "@/lib/leads-store";
import { findById } from "@/lib/users-store";
import { brandById } from "@/lib/brands";
import { rexConfigured, rexContactActive } from "@/lib/rex";

// The agent says this person was deleted inside Rex. Verify against Rex
// itself before touching anything: if the contact is genuinely gone (or we
// never recorded a Rex id — e.g. pushed by the old stub), reset the file to
// its pre-push state so they can be pushed again; if they're still active in
// Rex, refuse and say so. Body: { leadId }.
export async function POST(req: NextRequest) {
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const leadId = String(body?.leadId ?? "");
  if (!leadId) {
    return NextResponse.json({ error: "leadId required" }, { status: 400 });
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
  if (brandById(user.brandId)?.crmName !== "REX") {
    return NextResponse.json(
      { error: "This business doesn't use REX." },
      { status: 400 }
    );
  }
  if (lead.stage !== "pushed") {
    return NextResponse.json(
      { error: "Only a lead that's in REX can be reset." },
      { status: 400 }
    );
  }

  // Verify against Rex before resetting — the file should reflect reality,
  // not just what the agent believes happened.
  if (lead.rexContactId && rexConfigured()) {
    try {
      const active = await rexContactActive(lead.rexContactId, user.brandId);
      if (active) {
        return NextResponse.json({ ok: false, stillInRex: true });
      }
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Couldn't check REX" },
        { status: 502 }
      );
    }
  }

  const updated = await resetLeadFromRex(userId, leadId);
  if (!updated) {
    return NextResponse.json({ error: "Couldn't reset the file" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, lead: updated });
}
