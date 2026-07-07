import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth";
import { findById } from "@/lib/users-store";
import { countNewLeads } from "@/lib/leads-store";
import { countPendingForBrand } from "@/lib/referrals-store";

// Small counts that drive the nav notification dots: leads still at "new",
// and pending referrals sent to this agent's business by others.
export async function GET(req: NextRequest) {
  const id = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!id) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const user = await findById(id);
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const [newLeads, pendingReferrals] = await Promise.all([
    countNewLeads(user.id),
    countPendingForBrand(user.brandId, user.id),
  ]);
  return NextResponse.json({ newLeads, pendingReferrals });
}
