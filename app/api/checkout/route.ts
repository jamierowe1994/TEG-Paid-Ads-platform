import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth";
import { findById, updateUser } from "@/lib/users-store";
import { createCheckoutSession } from "@/lib/stripe";

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

  const origin =
    req.headers.get("origin") ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    new URL(req.url).origin;

  const body = await req.json().catch(() => ({}));
  const packageId = String(body?.packageId ?? "");

  const result = await createCheckoutSession({
    user,
    packageId,
    origin,
    // The wizard's React state is gone after the redirect, so carry the
    // package back in the URL — the signup page already reads ?package= to
    // seed itself, which lets the confirmation screen name it.
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
