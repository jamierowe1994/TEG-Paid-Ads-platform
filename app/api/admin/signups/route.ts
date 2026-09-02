import { NextRequest, NextResponse } from "next/server";
import { adminScope } from "@/lib/admin-auth";
import { listOpenPendingSignups } from "@/lib/pending-signups";

/* Who is stuck at the payment page right now.
 *
 * These are NOT accounts — that's the point. Since payment moved in front of
 * account creation, someone who reaches Stripe and walks away leaves a row
 * here and nothing else: no login, no half-portal, and no "new signup" email
 * to Hayley. This endpoint is how they stay visible anyway, because a person
 * who got as far as the card page is a sales prospect, not a mistake.
 *
 * Brand-scoped for an MD, everything for a super admin. No password hashes
 * leave this route.
 */
export async function GET(req: NextRequest) {
  const scope = adminScope(req);
  if (!scope) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const all = await listOpenPendingSignups();
  const visible =
    scope.role === "super" ? all : all.filter((p) => p.brandId === scope.brandId);

  return NextResponse.json({
    pending: visible.map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      brandId: p.brandId,
      packageId: p.packageId,
      createdAt: p.createdAt,
      /** They got far enough for Stripe to make them a customer record. */
      reachedStripe: !!p.stripeCustomerId,
    })),
  });
}
