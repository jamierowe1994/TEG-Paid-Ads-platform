import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth";
import { findById, updateUser, toPublic } from "@/lib/users-store";
import { packageById } from "@/lib/packages";

// Upgrade a referrals-only account to the full Paid Ads system.
// Body: { packageId }
//
// TODO(stripe): take payment BEFORE flipping the account. For now this unlocks
// immediately in demo mode, mirroring how signup works today.
export async function POST(req: NextRequest) {
  const id = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!id) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const user = await findById(id);
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const pkg = packageById(body?.packageId);
  if (!pkg) {
    return NextResponse.json({ error: "Pick a package to continue." }, { status: 400 });
  }

  const updated = await updateUser(id, {
    accountType: "paid",
    packageId: pkg.id,
    paid: true,
  });
  if (!updated) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  return NextResponse.json({ user: toPublic(updated) });
}
