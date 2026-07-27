import "server-only";
import Stripe from "stripe";
import { packageById, type AdPackage } from "./packages";
import type { StoredUser } from "./users-store";

/* Stripe wiring.
 *
 * The subscription is deliberately TWO line items, mirroring what the site
 * promises: a flat management fee that's identical on every package, plus the
 * ad spend for the tier the agent picked. That way an invoice shows the split
 * rather than one lump sum, changing tier swaps a single line, and the fee can
 * be repriced once for everybody without touching the tiers.
 *
 * Env (set in .env.local locally, and on the Railway service for deploys):
 *   STRIPE_SECRET_KEY           sk_test_… / sk_live_…
 *   STRIPE_WEBHOOK_SECRET       whsec_…  (from `stripe listen` or the dashboard)
 *   STRIPE_PRICE_MANAGEMENT     price_…  the flat £100/month fee
 *   STRIPE_PRICE_ADSPEND_STARTER|_GROWTH|_ACCELERATE   price_…
 *
 * Run `node scripts/stripe-setup.mjs` to create the products/prices and print
 * these lines ready to paste. Nothing here throws at import time — the app
 * still boots with Stripe unconfigured, and the checkout route says so.
 */

export function stripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

let cached: Stripe | null = null;

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set — add it to .env.local (and Railway)."
    );
  }
  if (!cached) cached = new Stripe(key);
  return cached;
}

/** True when the configured key is a live one. Used to keep test data honest. */
export function isLiveMode(): boolean {
  return (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_live");
}

const AD_SPEND_ENV: Record<AdPackage["id"], string> = {
  starter: "STRIPE_PRICE_ADSPEND_STARTER",
  growth: "STRIPE_PRICE_ADSPEND_GROWTH",
  accelerate: "STRIPE_PRICE_ADSPEND_ACCELERATE",
};

/**
 * The two line items for a package, or a list of what's missing. Returning the
 * missing names rather than throwing means the checkout route can say exactly
 * which env var to set instead of a generic 500.
 */
export function lineItemsFor(
  packageId: string
):
  | { ok: true; pkg: AdPackage; items: { price: string; quantity: number }[] }
  | { ok: false; missing: string[] } {
  const pkg = packageById(packageId);
  if (!pkg) return { ok: false, missing: ["a valid packageId"] };

  const management = process.env.STRIPE_PRICE_MANAGEMENT;
  const adSpend = process.env[AD_SPEND_ENV[pkg.id]];

  const missing: string[] = [];
  if (!management) missing.push("STRIPE_PRICE_MANAGEMENT");
  if (!adSpend) missing.push(AD_SPEND_ENV[pkg.id]);
  if (missing.length) return { ok: false, missing };

  return {
    ok: true,
    pkg,
    items: [
      { price: management as string, quantity: 1 },
      { price: adSpend as string, quantity: 1 },
    ],
  };
}

/** The 3-month minimum term from the partner pack, as an ISO date. */
export function commitmentEnd(from = new Date()): string {
  const d = new Date(from);
  d.setMonth(d.getMonth() + 3);
  return d.toISOString();
}

/**
 * Create a Checkout Session for a user + package. Shared by signup and the
 * referrals→paid upgrade so the two can't drift — in particular so neither can
 * quietly forget the metadata the webhook needs to find the account again.
 *
 * Never grants access. The webhook does that, and only after Stripe confirms.
 */
export async function createCheckoutSession(opts: {
  user: StoredUser;
  packageId: string;
  origin: string;
  successUrl: string;
  cancelUrl: string;
  /** Called when a Stripe customer had to be created, so it can be persisted. */
  onCustomerCreated?: (customerId: string) => Promise<void>;
}): Promise<{ url: string } | { error: string; status: number }> {
  if (!stripeConfigured()) {
    return {
      error: "Payments aren't configured yet (STRIPE_SECRET_KEY is unset).",
      status: 503,
    };
  }

  const resolved = lineItemsFor(opts.packageId);
  if (!resolved.ok) {
    return {
      error: `Payments aren't configured yet — missing ${resolved.missing.join(", ")}.`,
      status: 503,
    };
  }

  const stripe = getStripe();
  const { user } = opts;

  // Reuse the customer so repeat attempts don't scatter duplicates.
  let customerId = user.stripeCustomerId ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name,
      phone: user.mobile || undefined,
      metadata: { userId: user.id, brandId: user.brandId },
    });
    customerId = customer.id;
    await opts.onCustomerCreated?.(customerId);
  }

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
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    allow_promotion_codes: true,
    billing_address_collection: "auto",
  });

  if (!session.url) {
    return { error: "Stripe didn't return a checkout URL.", status: 502 };
  }
  return { url: session.url };
}
