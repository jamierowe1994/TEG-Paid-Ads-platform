import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth";
import { findById, updateUser, toPublic } from "@/lib/users-store";
import { packageById } from "@/lib/packages";
import { createCheckoutSession, stripeConfigured } from "@/lib/stripe";

/* Upgrade a referrals-only account to the full Paid Ads system.
 * Body: { packageId }  →  { url } to redirect to, or { user } in demo mode.
 *
 * This used to set paid:true directly, which meant anyone holding a free
 * referrals account could POST here and unlock the paid portal for nothing.
 * Harmless while there was no way to pay at all; not harmless now, and about
 * to be handed to a few hundred people.
 *
 * It now starts a Stripe Checkout Session. Access is granted by the webhook,
 * exactly as at signup — this route never flips the account itself.
 *
 * The exception is when Stripe isn't configured: there's then no way to ever
 * pay, so it keeps the old demo behaviour rather than leaving a dead button.
 * Configuring Stripe is what turns real billing on.
 */
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

  if (!stripeConfigured()) {
    const updated = await updateUser(id, {
      accountType: "paid",
      packageId: pkg.id,
      paid: true,
    });
    if (!updated) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }
    return NextResponse.json({ user: toPublic(updated) });
  }

  const origin =
    req.headers.get("origin") ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    new URL(req.url).origin;

  // Record the tier they picked so the portal shows the right one while
  // payment is pending. Grants nothing on its own: `paid` is untouched, and
  // lib/api-guard.ts keys off that.
  await updateUser(id, { packageId: pkg.id });

  const result = await createCheckoutSession({
    user,
    packageId: pkg.id,
    origin,
    successUrl: `${origin}/dashboard?checkout=success`,
    cancelUrl: `${origin}/dashboard/profile?checkout=cancelled`,
    onCustomerCreated: async (customerId) => {
      await updateUser(user.id, { stripeCustomerId: customerId });
    },
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ url: result.url });
}
