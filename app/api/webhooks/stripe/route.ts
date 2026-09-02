import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { findById, findByStripeCustomer, updateUser } from "@/lib/users-store";
import { getStripe, commitmentEnd, stripeConfigured } from "@/lib/stripe";
import { packageById } from "@/lib/packages";
import {
  materialisePendingSignup,
  findPendingSignup,
} from "@/lib/pending-signups";

/* Stripe webhook — the ONLY thing that grants or removes paid access.
 *
 * Nothing else in the app sets `paid`. Checkout finishing in the browser isn't
 * proof of payment (the tab can be closed, the card can fail after the
 * redirect), so access is granted here and nowhere else.
 *
 * Local testing:
 *   stripe listen --forward-to localhost:3000/api/webhooks/stripe
 * That prints a whsec_… — put it in .env.local as STRIPE_WEBHOOK_SECRET.
 *
 * Production: add the endpoint in the Stripe dashboard pointing at
 *   https://launchpad.theexpertsgroup.co.uk/api/webhooks/stripe
 * and copy ITS signing secret into Railway (it differs from the CLI one).
 */

// The raw body is required for signature verification, so this must not run
// through any body parsing.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HANDLED: Stripe.Event["type"][] = [
  "checkout.session.completed",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
];

// Stripe statuses that should keep the portal open. past_due deliberately
// stays open — the card retries for a while, and locking someone out the
// moment a renewal blips is worse than a few days of grace.
const OPEN = new Set(["active", "trialing", "past_due"]);

export async function POST(req: NextRequest) {
  if (!stripeConfigured()) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "STRIPE_WEBHOOK_SECRET is not set" },
      { status: 503 }
    );
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "No signature" }, { status: 400 });
  }

  const raw = await req.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, signature, secret);
  } catch (err) {
    // A bad signature means it isn't from Stripe. Never act on it.
    console.error("[stripe] signature verification failed:", err);
    return NextResponse.json({ error: "Bad signature" }, { status: 400 });
  }

  if (!HANDLED.includes(event.type)) {
    // Acknowledge everything else so Stripe doesn't retry events we ignore.
    return NextResponse.json({ received: true });
  }

  try {
    await handle(event, stripe);
  } catch (err) {
    // 500 tells Stripe to retry — right for a transient DB failure, and the
    // handlers below are idempotent so a repeat is harmless.
    console.error(`[stripe] handler failed for ${event.type}:`, err);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}


/* When the current period ends. Recent Stripe API versions moved
   current_period_end off the subscription and onto its items, so read the item
   first and fall back — otherwise this silently returns undefined and the
   renewal date never updates. */
function periodEnd(sub: Stripe.Subscription): string | null {
  const fromItem = sub.items?.data?.[0]?.current_period_end;
  const legacy = (sub as unknown as { current_period_end?: number })
    .current_period_end;
  const secs = fromItem ?? legacy;
  return typeof secs === "number" ? new Date(secs * 1000).toISOString() : null;
}

async function handle(event: Stripe.Event, stripe: Stripe) {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;
      const pendingId = session.metadata?.pendingId;
      const packageId = session.metadata?.packageId;
      if (!userId && !pendingId) return;

      const subId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id ?? null;
      // Read the subscription back rather than assuming it's active — a
      // session can complete with the subscription still incomplete.
      let subStatus: string | null = null;
      let subRenewsAt: string | null = null;
      if (subId) {
        const sub = await stripe.subscriptions.retrieve(subId);
        subStatus = sub.status;
        subRenewsAt = periodEnd(sub);
      }

      /* A signup that has no account yet: this payment is what creates it.
         Idempotent, and the same call the browser makes on its way back from
         Checkout — whichever gets here second does nothing. */
      if (pendingId) {
        const made = await materialisePendingSignup(pendingId, {
          stripeCustomerId:
            typeof session.customer === "string" ? session.customer : null,
          stripeSubscriptionId: subId,
          subscriptionStatus: subStatus,
          renewsAt: subRenewsAt,
          paid: subStatus ? OPEN.has(subStatus) : false,
          packageId: packageById(packageId)?.id,
        });
        if (!made) {
          console.error(`[stripe] no pending signup for id ${pendingId}`);
          return;
        }
        console.log(
          `[stripe] ${made.user.email} → account ${made.created ? "created" : "already existed"} (${subStatus})`
        );
        return;
      }

      const user = await findById(userId!);
      if (!user) {
        console.error(`[stripe] no user for id ${userId}`);
        return;
      }

      const subscriptionId = subId;
      const status = subStatus;
      const renewsAt = subRenewsAt;
      const pkg = packageById(packageId);
      await updateUser(user.id, {
        stripeCustomerId:
          typeof session.customer === "string"
            ? session.customer
            : user.stripeCustomerId ?? null,
        stripeSubscriptionId: subscriptionId,
        subscriptionStatus: status,
        renewsAt,
        paid: status ? OPEN.has(status) : false,
        // Paying activates the full system, even if they signed up on the
        // free referrals tier and upgraded.
        accountType: "paid",
        ...(pkg ? { packageId: pkg.id } : {}),
        // Only stamp the minimum term on the first successful payment.
        ...(user.commitmentEndsAt ? {} : { commitmentEndsAt: commitmentEnd() }),
      });
      console.log(`[stripe] ${user.email} → paid (${status})`);
      return;
    }

    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const user = await userForSubscription(sub);
      if (!user) return;

      const status =
        event.type === "customer.subscription.deleted" ? "canceled" : sub.status;

      await updateUser(user.id, {
        subscriptionStatus: status,
        paid: OPEN.has(status),
        stripeSubscriptionId: sub.id,
        renewsAt: periodEnd(sub),
        // Mirror Stripe's own cancel_at_period_end so the portal and the app
        // can't disagree about whether a cancellation is pending — whichever
        // one it was set from.
        cancelRequestedAt: sub.cancel_at_period_end
          ? (user.cancelRequestedAt ?? new Date().toISOString())
          : null,
      });
      console.log(`[stripe] ${user.email} → ${status}`);
      return;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId =
        typeof invoice.customer === "string" ? invoice.customer : null;
      if (!customerId) return;
      const user = await userForCustomer(customerId);
      if (!user) return;
      // Don't revoke here — Stripe retries, and the subscription.updated event
      // that follows carries the authoritative status. Just record it.
      await updateUser(user.id, { subscriptionStatus: "past_due" });
      console.log(`[stripe] ${user.email} → payment failed`);
      return;
    }
  }
}

// Prefer the metadata we set at checkout; fall back to the customer id for
// subscriptions created or changed in the Stripe dashboard by hand.
async function userForSubscription(sub: Stripe.Subscription) {
  const userId = sub.metadata?.userId;
  if (userId) {
    const user = await findById(userId);
    if (user) return user;
  }
  /* A subscription created by the pay-first signup flow. Once the account
     exists the pending row points at it; before that there's genuinely
     nobody to update, and checkout.session.completed is right behind this
     with the same status. */
  const pendingId = sub.metadata?.pendingId;
  if (pendingId) {
    const pending = await findPendingSignup(pendingId);
    if (pending?.userId) {
      const user = await findById(pending.userId);
      if (user) return user;
    }
  }
  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  return customerId ? userForCustomer(customerId) : undefined;
}

async function userForCustomer(customerId: string) {
  return findByStripeCustomer(customerId);
}
