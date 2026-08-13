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

const DEFAULT_PROMO_EMAILS = "howard.russell@theexpertsgroup.co.uk";
export function promoAllowed(email: string): boolean {
  const list = (process.env.STRIPE_PROMO_EMAILS ?? DEFAULT_PROMO_EMAILS)
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.trim().toLowerCase());
}

/** True when the configured key is a live one. Used to keep test data honest. */
export function isLiveMode(): boolean {
  return (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_live");
}

/* ONE all-in price per package (James, 12 Aug 2026). The checkout used to
 * split management fee + ad-spend tier into two line items — still a single
 * payment, but it demanded FOUR Stripe prices where the live catalogue holds
 * three all-in products, and the split told Stripe something only the app
 * needs to know: how much of the price goes to Meta is portal logic
 * (packages.ts adSpend / adSpendCapFor), not billing structure.
 *
 * Env: STRIPE_PRICE_<PACKAGE>, with the legacy STRIPE_PRICE_ADSPEND_<...>
 * names still honoured so existing Railway config keeps working. The price
 * must be the package's TOTAL (£250/£400/£550) — the amount charged is
 * whatever the Stripe price says, so a tier-sized price here would
 * undercharge by the management fee. STRIPE_PRICE_MANAGEMENT is no longer
 * used anywhere.
 */
const PACKAGE_PRICE_ENV: Record<AdPackage["id"], string[]> = {
  starter: ["STRIPE_PRICE_STARTER", "STRIPE_PRICE_ADSPEND_STARTER"],
  growth: ["STRIPE_PRICE_GROWTH", "STRIPE_PRICE_ADSPEND_GROWTH"],
  accelerate: ["STRIPE_PRICE_ACCELERATE", "STRIPE_PRICE_ADSPEND_ACCELERATE"],
};

export function packagePriceEnv(packageId: string): string | null {
  const names = PACKAGE_PRICE_ENV[packageId as AdPackage["id"]];
  if (!names) return null;
  for (const n of names) {
    const v = process.env[n]?.trim();
    if (v) return v;
  }
  return null;
}

/**
 * The line item for a package, or what's missing. Returning the missing name
 * rather than throwing means the checkout route can say exactly which env var
 * to set instead of a generic 500.
 */
export function lineItemsFor(
  packageId: string
):
  | { ok: true; pkg: AdPackage; items: { price: string; quantity: number }[] }
  | { ok: false; missing: string[] } {
  const pkg = packageById(packageId);
  if (!pkg) return { ok: false, missing: ["a valid packageId"] };
  const price = packagePriceEnv(pkg.id);
  if (!price) return { ok: false, missing: [PACKAGE_PRICE_ENV[pkg.id][0]] };
  return { ok: true, pkg, items: [{ price, quantity: 1 }] };
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
    // The promo-code box shows ONLY for allowlisted test emails (Howard's
    // 50p go-live run). Everyone else gets a checkout with no code field —
    // a visible "add promotion code" is an invitation to go hunting for
    // one. STRIPE_PROMO_EMAILS (comma-separated) overrides the default.
    allow_promotion_codes: promoAllowed(user.email),
    billing_address_collection: "auto",
  });

  if (!session.url) {
    return { error: "Stripe didn't return a checkout URL.", status: 502 };
  }
  return { url: session.url };
}

/* ── Customer portal configurations ────────────────────────────────────────
 *
 * We do NOT use Stripe's default portal configuration. The default has
 * cancellation switched on, which would let someone inside the three-month
 * minimum term cancel from the portal and walk straight around the rule the
 * app enforces — the term would be unenforceable in practice, however the
 * dashboard toggle happens to be set on any given day.
 *
 * So the app owns two configurations and picks per customer:
 *   · in the minimum term  → no cancellation offered
 *   · out of it            → cancellation offered, at period end
 *
 * Both are created on demand and found again by lookup metadata, so this is
 * idempotent and survives someone editing the dashboard.
 */
const PORTAL_TAG = "launchpad_portal_v1";

function portalUrls() {
  const site =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://launchpad.theexpertsgroup.co.uk";
  return {
    terms_of_service_url: `${site}/terms`,
    privacy_policy_url: `${site}/privacy`,
  };
}

// Cache within the process so a busy page doesn't re-list on every click.
const portalCache = new Map<string, string>();

export async function portalConfigurationFor(
  allowCancel: boolean
): Promise<string | undefined> {
  const key = allowCancel ? `${PORTAL_TAG}_cancel` : `${PORTAL_TAG}_nocancel`;
  const cached = portalCache.get(key);
  if (cached) return cached;

  const stripe = getStripe();

  const existing = await stripe.billingPortal.configurations.list({ limit: 100 });
  const found = existing.data.find((c) => c.metadata?.launchpad === key);
  if (found) {
    portalCache.set(key, found.id);
    return found.id;
  }

  const created = await stripe.billingPortal.configurations.create({
    business_profile: portalUrls(),
    metadata: { launchpad: key },
    features: {
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      customer_update: {
        enabled: true,
        allowed_updates: ["email", "address"],
      },
      // Plan switching stays off in both: the pack promises changes "at any
      // renewal", and the portal would apply them immediately with proration.
      subscription_update: { enabled: false },
      subscription_cancel: allowCancel
        ? { enabled: true, mode: "at_period_end" }
        : { enabled: false },
    },
  });
  portalCache.set(key, created.id);
  return created.id;
}
