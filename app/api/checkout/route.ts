import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth";
import { findById, updateUser } from "@/lib/users-store";
import { getStripe, lineItemsFor, stripeConfigured } from "@/lib/stripe";

/* Starts a Stripe Checkout Session for the signed-in user's chosen package.
 *
 * Body: { packageId }
 * Returns: { url } — the client redirects there.
 *
 * Checkout is hosted by Stripe on purpose: it handles SCA/3-D Secure, card
 * wallets, retries and receipts, none of which we want to own. The account is
 * created BEFORE this runs (so there's something to attach the customer to)
 * but stays paid:false until the webhook confirms payment — this route never
 * grants access.
 */
export async function POST(req: NextRequest) {
  const id = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!id) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const user = await findById(id);
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  if (!stripeConfigured()) {
    return NextResponse.json(
      { error: "Payments aren't configured yet (STRIPE_SECRET_KEY is unset)." },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const resolved = lineItemsFor(String(body?.packageId ?? ""));
  if (!resolved.ok) {
    return NextResponse.json(
      { error: `Payments aren't configured yet — missing ${resolved.missing.join(", ")}.` },
      { status: 503 }
    );
  }

  const stripe = getStripe();

  // Reuse the customer if this account has already been through checkout, so
  // repeat attempts don't scatter duplicate customers through the dashboard.
  let customerId = user.stripeCustomerId ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name,
      phone: user.mobile || undefined,
      metadata: { userId: user.id, brandId: user.brandId },
    });
    customerId = customer.id;
    await updateUser(user.id, { stripeCustomerId: customerId });
  }

  const origin =
    req.headers.get("origin") ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    new URL(req.url).origin;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: resolved.items,
    // Both the session and the subscription carry the userId: the webhook
    // reads it from whichever event arrives, rather than depending on one.
    metadata: { userId: user.id, packageId: resolved.pkg.id },
    subscription_data: {
      metadata: { userId: user.id, packageId: resolved.pkg.id },
    },
    success_url: `${origin}/signup?checkout=success`,
    cancel_url: `${origin}/signup?checkout=cancelled`,
    allow_promotion_codes: true,
    billing_address_collection: "auto",
  });

  if (!session.url) {
    return NextResponse.json(
      { error: "Stripe didn't return a checkout URL." },
      { status: 502 }
    );
  }

  return NextResponse.json({ url: session.url });
}
