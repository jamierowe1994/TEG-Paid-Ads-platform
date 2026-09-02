import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth";
import { findById, updateUser } from "@/lib/users-store";
import { createCheckoutSession, subjectFromUser } from "@/lib/stripe";
import {
  findPendingSignup,
  setPendingCustomer,
} from "@/lib/pending-signups";

/* Starts a Stripe Checkout Session.
 *
 * Body: { packageId, pendingId? }
 * Returns: { url } — the client redirects there.
 *
 * Two callers, and they're in different states:
 *
 *   · A NEW signup, which has no account yet. Payment now comes before
 *     account creation, so there's nothing to be signed in as — the wizard
 *     passes the pendingId it got back from /api/auth/signup, and the account
 *     is created from it once Stripe confirms the money.
 *
 *   · An EXISTING account upgrading from the free referrals tier, which is
 *     signed in normally.
 *
 * Checkout is hosted by Stripe on purpose: it handles SCA/3-D Secure, card
 * wallets, retries and receipts, none of which we want to own. This route
 * never grants access — only the webhook does.
 */
export async function POST(req: NextRequest) {
  const origin =
    req.headers.get("origin") ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    new URL(req.url).origin;

  const body = await req.json().catch(() => ({}));
  const packageId = String(body?.packageId ?? "");
  const pendingId = String(body?.pendingId ?? "");

  const sessionUserId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  const user = sessionUserId ? await findById(sessionUserId) : null;

  // A signed-in account takes precedence: it's the upgrade path, and it has a
  // real id for the webhook to find.
  if (user) {
    const result = await createCheckoutSession({
      user: subjectFromUser(user),
      packageId,
      origin,
      successUrl: `${origin}/signup?checkout=success&package=${packageId}`,
      cancelUrl: `${origin}/signup?checkout=cancelled`,
      onCustomerCreated: async (customerId) => {
        await updateUser(user.id, { stripeCustomerId: customerId });
      },
    });
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ url: result.url });
  }

  const pending = pendingId ? await findPendingSignup(pendingId) : null;
  if (!pending) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  if (pending.consumedAt) {
    // Already paid for and turned into an account. Charging again would take
    // a second subscription for the same thing.
    return NextResponse.json(
      { error: "That signup has already been paid for. Sign in instead." },
      { status: 409 }
    );
  }

  const result = await createCheckoutSession({
    user: {
      pendingId: pending.id,
      email: pending.email,
      name: pending.name,
      mobile: pending.mobile,
      brandId: pending.brandId,
      stripeCustomerId: pending.stripeCustomerId,
    },
    packageId: packageId || pending.packageId,
    origin,
    // The session id lets the browser claim the account the moment it lands
    // back, rather than waiting on the webhook — see /api/auth/claim.
    successUrl: `${origin}/signup?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    // Nothing was created, so there's nothing to come back to. Home, with a
    // note, rather than a half-finished wizard they can't complete.
    cancelUrl: `${origin}/?checkout=cancelled`,
    onCustomerCreated: async (customerId) => {
      await setPendingCustomer(pending.id, customerId);
    },
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ url: result.url });
}
