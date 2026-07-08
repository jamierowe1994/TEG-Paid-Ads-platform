import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth";
import { getLead, updateLeadStage } from "@/lib/leads-store";
import { findById } from "@/lib/users-store";
import { pushLeadToAtlas, atlasConfigured } from "@/lib/atlas";

// Push a lead into the brand's CRM. Only The Recruitment Experts (Atlas) is
// wired up so far; other brands' CRMs (REP etc.) return a clear "not yet"
// rather than pretending to succeed. Body: { leadId }.
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

  // Atlas is the recruitment brand's CRM. Everyone else's CRM isn't built yet.
  if (user.brandId !== "recruitment") {
    return NextResponse.json(
      { error: "CRM push is only connected for The Recruitment Experts so far." },
      { status: 400 }
    );
  }
  if (!atlasConfigured()) {
    return NextResponse.json(
      { error: "Atlas isn't connected yet — add ATLAS_API_KEY in Railway." },
      { status: 503 }
    );
  }

  try {
    const result = await pushLeadToAtlas(lead, user.email);
    // Record it in the funnel as pushed to the CRM.
    await updateLeadStage(userId, leadId, "pushed");
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Atlas push failed" },
      { status: 502 }
    );
  }
}
