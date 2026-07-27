/*
 * Creates the Stripe Products and Prices for Launch Pad, then prints the env
 * lines to paste. Run it once per Stripe mode (test, then live).
 *
 *   node scripts/stripe-setup.mjs
 *
 * It reads STRIPE_SECRET_KEY from .env.local, so your key never has to be
 * typed on the command line or pasted anywhere else.
 *
 * Safe to re-run: it looks up existing products by their lookup key first and
 * reuses them, so you won't end up with duplicates in the dashboard.
 *
 * Prices in Stripe are IMMUTABLE — you can't edit an amount. If pricing
 * changes, this creates a new price and prints a new id; the old one keeps
 * working for anyone already subscribed to it, which is what you want.
 */
import Stripe from "stripe";
import { readFileSync } from "node:fs";

// Minimal .env.local reader — avoids a dependency just for this.
function loadEnv() {
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    /* no .env.local — fall back to the real environment */
  }
}
loadEnv();

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error(
    "\n  STRIPE_SECRET_KEY is not set.\n" +
      "  Add it to .env.local first:  STRIPE_SECRET_KEY=sk_test_...\n"
  );
  process.exit(1);
}

const stripe = new Stripe(key);
const live = key.startsWith("sk_live");

// Must match lib/packages.ts. Amounts are in pence.
const MANAGEMENT = { name: "Launch Pad — Management", amount: 10000 };
const AD_SPEND = [
  { id: "starter", name: "Launch Pad — Ad spend (Starter, £5/day)", amount: 15000, env: "STRIPE_PRICE_ADSPEND_STARTER" },
  { id: "growth", name: "Launch Pad — Ad spend (Growth, £10/day)", amount: 30000, env: "STRIPE_PRICE_ADSPEND_GROWTH" },
  { id: "accelerate", name: "Launch Pad — Ad spend (Accelerate, £15/day)", amount: 45000, env: "STRIPE_PRICE_ADSPEND_ACCELERATE" },
];

async function ensure(lookupKey, name, amount) {
  // Reuse an existing price with this lookup key if there is one.
  const found = await stripe.prices.list({
    lookup_keys: [lookupKey],
    active: true,
    limit: 1,
  });
  if (found.data[0]) {
    console.log(`  reused   ${name}`);
    return found.data[0].id;
  }

  const product = await stripe.products.create({
    name,
    metadata: { launchpad: lookupKey },
  });
  const price = await stripe.prices.create({
    product: product.id,
    currency: "gbp",
    unit_amount: amount,
    recurring: { interval: "month" },
    lookup_key: lookupKey,
  });
  console.log(`  created  ${name}  £${(amount / 100).toFixed(2)}/month`);
  return price.id;
}

console.log(
  `\nStripe setup — ${live ? "LIVE MODE" : "test mode"}\n` +
    "─".repeat(48)
);
if (live) {
  console.log("  ⚠  This is your LIVE key. Real products will be created.\n");
}

const out = {};
out.STRIPE_PRICE_MANAGEMENT = await ensure(
  "launchpad_management",
  MANAGEMENT.name,
  MANAGEMENT.amount
);
for (const tier of AD_SPEND) {
  out[tier.env] = await ensure(
    `launchpad_adspend_${tier.id}`,
    tier.name,
    tier.amount
  );
}

console.log(
  "\n" +
    "─".repeat(48) +
    "\nPaste these into .env.local (and the Railway service):\n"
);
for (const [k, v] of Object.entries(out)) console.log(`${k}=${v}`);
console.log(
  "\nPrice ids aren't secret — they're safe to share. Your secret key is not.\n"
);
