import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth";
import { getLead, updateLeadStage, setLeadRexIds } from "@/lib/leads-store";
import { syncReferralFromLead } from "@/lib/referrals-store";
import { findById } from "@/lib/users-store";
import { pushLeadToAtlas, atlasConfigured } from "@/lib/atlas";
import { pushLeadToRex, rexConfigured, rexFindUserIdByEmail } from "@/lib/rex";

// Brands whose CRM is Rex (rexsoftware.com) — the rest either use Atlas
// (recruitment) or don't have a CRM push wired up yet.
const REX_BRANDS = new Set([
  "property",
  "lettings",
  "fineandcountry",
  "auction",
]);

// Push a lead into the brand's CRM: Atlas for Recruitment, Rex for
// Property/Lettings/Fine & Country/Auction. Body: { leadId }.
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

  // Mirrors the lead's progress back to the referral that sent it, if any —
  // covers both CRMs so a referrer sees "pushed to CRM" either way.
  const ownerId: string = userId;
  const referralId = lead.referralId;
  async function markPushed() {
    await updateLeadStage(ownerId, leadId, "pushed");
    if (referralId) await syncReferralFromLead(leadId, "pushed");
  }

  if (user.brandId === "recruitment") {
    if (!atlasConfigured()) {
      return NextResponse.json(
        { error: "Atlas isn't connected yet — add ATLAS_API_KEY in Railway." },
        { status: 503 }
      );
    }
    try {
      const result = await pushLeadToAtlas(lead, user.email);
      await markPushed();
      return NextResponse.json({ ok: true, ...result });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Atlas push failed" },
        { status: 502 }
      );
    }
  }

  if (REX_BRANDS.has(user.brandId)) {
    if (!rexConfigured()) {
      return NextResponse.json(
        {
          error:
            "Rex isn't connected yet — add REX_API_EMAIL/PASSWORD in Railway.",
        },
        { status: 503 }
      );
    }
    try {
      // Who owns this in Rex: an explicit admin-set id wins, otherwise match
      // the agent by email — the same address they sign into Rex with. Both
      // missing → the push still goes through, just unowned.
      const agentRexUserId =
        user.rexUserId ??
        (await rexFindUserIdByEmail(user.email, user.brandId));
      const result = await pushLeadToRex(lead, user.brandId, {
        agentRexUserId,
      });
      await setLeadRexIds(userId, leadId, result.contactId, result.leadId);
      await markPushed();
      return NextResponse.json({ ok: true, ...result });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Rex push failed" },
        { status: 502 }
      );
    }
  }

  return NextResponse.json(
    { error: "CRM push isn't connected for this business yet." },
    { status: 400 }
  );
}
