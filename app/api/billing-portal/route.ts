import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth";
import { findById } from "@/lib/users-store";
import { getStripe, stripeConfigured } from "@/lib/stripe";

/* Stripe's hosted Billing Portal: update the card, download invoices and
 * receipts, cancel. All three are Stripe's own screens, which is why this
 * route is twenty lines rather than three pages of ours — and it means we
 * never handle card details.
 *
 * Returns { url } to redirect to. Nothing here changes the account: anything
 * the customer does in the portal comes back as a webhook
 * (customer.subscription.updated / .deleted), which is what actually updates
 * `paid`. So a cancellation made in the portal flows through the same single
 * path as everything else.
 *
 * What the portal is allowed to offer is configured once in the Stripe
 * dashboard under Settings → Billing → Customer portal.
 */
export async function POST(req: NextRequest) {
  const id = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!id) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const user = await findById(id);
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  if (!stripeConfigured()) {
    return NextResponse.json(
      { error: "Payments aren't configured yet." },
      { status: 503 }
    );
  }

  // No customer means they've never been through checkout — there's nothing
  // to manage, and Stripe would just error.
  if (!user.stripeCustomerId) {
    return NextResponse.json(
      { error: "No billing set up on this account yet." },
      { status: 400 }
    );
  }

  const origin =
    req.headers.get("origin") ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    new URL(req.url).origin;

  try {
    const session = await getStripe().billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${origin}/dashboard/profile`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    // The commonest cause by far is the portal never having been configured
    // in the dashboard, which gives an unhelpful raw Stripe error otherwise.
    console.error("[stripe] billing portal failed:", err);
    return NextResponse.json(
      {
        error:
          "Couldn't open the billing portal. If this is the first time, enable it in Stripe → Settings → Billing → Customer portal.",
      },
      { status: 502 }
    );
  }
}
