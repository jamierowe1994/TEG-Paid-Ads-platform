import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "./auth";
import { findById, type StoredUser } from "./users-store";

// Server-side tier gate for the Paid Ads surfaces. The nav hides the paid
// pages from referrals-only accounts, but hiding isn't blocking — every
// paid-only API route calls this so a referrals-only session gets a 403 no
// matter how the request arrives. Returns either the signed-in paid user or
// the error response to send straight back.
export async function requirePaidUser(
  req: NextRequest
): Promise<{ user: StoredUser; error?: never } | { user?: never; error: NextResponse }> {
  const id = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!id) {
    return { error: NextResponse.json({ error: "Unauthorised" }, { status: 401 }) };
  }
  const user = await findById(id);
  if (!user || user.deactivatedAt) {
    return { error: NextResponse.json({ error: "Unauthorised" }, { status: 401 }) };
  }
  if (user.accountType === "referral") {
    return {
      error: NextResponse.json(
        {
          error: "Paid Ads isn't enabled on this account — upgrade to unlock it",
          code: "paid_only",
        },
        { status: 403 }
      ),
    };
  }
  return { user };
}
