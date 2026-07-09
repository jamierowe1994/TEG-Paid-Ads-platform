import { NextRequest, NextResponse } from "next/server";
import { listAllReferrals } from "@/lib/referrals-store";

function authorised(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const password = process.env.ADMIN_PASSWORD ?? "experts-admin";
  return auth === `Bearer ${password}`;
}

// Admin oversight: every referral in the group, so the MD can see who sent
// what, to which business, and where each one has got to.
export async function GET(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  return NextResponse.json(await listAllReferrals());
}
