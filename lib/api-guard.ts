import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "./auth";
import { findById, type StoredUser } from "./users-store";
import { adsCoveredByLicence } from "./ads-entitlement";
import type { BrandId } from "./brands";

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
  /* THE PAYMENT GATE. Signup deliberately creates the account before Stripe
   * (there has to be something to attach the customer to), so abandoning at
   * the payment page leaves a real, signable-in account — and until 26 Aug
   * nothing ever checked user.paid, so three abandoners got a fully working
   * portal for free (Craig B / Reena K / Eddie C, found by James).
   *
   * user.paid means "Stripe confirmed money". It is deliberately NOT the
   * only key: TLE's Pro-licence partners are paid:false BY DESIGN (their
   * licence covers it, and inventing a payment record for them would be a
   * lie), so an unpaid account is asked one more question — does a licence
   * cover it? — before being turned away. */
  if (!user.paid && !(await adsCoveredByLicence(user.email, user.brandId as BrandId))) {
    return {
      error: NextResponse.json(
        {
          error: "Your sign-up isn't finished — complete payment to unlock Paid Ads.",
          code: "payment_incomplete",
        },
        { status: 403 }
      ),
    };
  }
  return { user };
}
