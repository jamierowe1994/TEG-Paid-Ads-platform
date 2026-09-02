import { NextRequest, NextResponse } from "next/server";
import {
  createSessionToken,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth";
import { toPublic } from "@/lib/users-store";
import { getStripe, stripeConfigured } from "@/lib/stripe";
import { packageById } from "@/lib/packages";
import { materialisePendingSignup } from "@/lib/pending-signups";

/* Claim the account for a checkout that has just been paid.
 *
 * Body: { sessionId } — Stripe's own Checkout Session id, handed back in the
 * success URL and known only to the person who completed that checkout.
 *
 * Why this exists alongside the webhook: the webhook is authoritative, but
 * it's a server-to-server call that can take seconds and can be delayed or
 * retried. Someone who has just entered their card details should not be
 * watching a spinner while we wait for it. So the browser asks here, we
 * verify the payment with Stripe directly, and the account is created — by
 * the same idempotent function the webhook uses, so whichever arrives second
 * changes nothing.
 *
 * Nothing here trusts the browser. The session id is looked up in Stripe and
 * access is granted only on Stripe's own word that it's paid.
 */
const OPEN = new Set(["active", "trialing", "past_due"]);

export async function POST(req: NextRequest) {
  if (!stripeConfigured()) {
    return NextResponse.json({ error: "Payments aren't configured." }, { status: 503 });
  }
  const body = await req.json().catch(() => null);
  const sessionId = String(body?.sessionId ?? "").trim();
  if (!sessionId.startsWith("cs_")) {
    return NextResponse.json({ error: "Invalid checkout session" }, { status: 400 });
  }

  const stripe = getStripe();
  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch {
    return NextResponse.json({ error: "Unknown checkout session" }, { status: 404 });
  }

  const pendingId = session.metadata?.pendingId;
  if (!pendingId) {
    // An upgrade for an existing account — that path is already signed in and
    // has nothing to claim.
    return NextResponse.json({ error: "Nothing to claim" }, { status: 400 });
  }

  // Stripe's verdict, not ours. `paid` covers the card actually clearing;
  // anything else here means no account.
  if (session.payment_status !== "paid" && session.status !== "complete") {
    return NextResponse.json(
      { error: "That payment hasn't completed.", code: "unpaid" },
      { status: 402 }
    );
  }

  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id ?? null;
  let status: string | null = null;
  let renewsAt: string | null = null;
  if (subscriptionId) {
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    status = sub.status;
    const secs =
      sub.items?.data?.[0]?.current_period_end ??
      (sub as unknown as { current_period_end?: number }).current_period_end;
    renewsAt = typeof secs === "number" ? new Date(secs * 1000).toISOString() : null;
  }

  const made = await materialisePendingSignup(pendingId, {
    stripeCustomerId: typeof session.customer === "string" ? session.customer : null,
    stripeSubscriptionId: subscriptionId,
    subscriptionStatus: status,
    renewsAt,
    paid: status ? OPEN.has(status) : session.payment_status === "paid",
    packageId: packageById(session.metadata?.packageId)?.id,
  });

  if (!made) {
    // The pending row is gone — pruned after a week, or already cleaned up.
    // The payment is real, so this needs a person, not a retry.
    return NextResponse.json(
      {
        error:
          "Your payment went through but we couldn't finish setting up the account. Please contact us and we'll sort it straight away.",
        code: "pending_missing",
      },
      { status: 409 }
    );
  }

  // Signing them in here is the whole point: they've paid, the account is
  // real, and they should land in the portal rather than at a login screen.
  const res = NextResponse.json({ user: toPublic(made.user) });
  res.cookies.set(
    SESSION_COOKIE,
    createSessionToken(made.user.id),
    sessionCookieOptions()
  );
  return res;
}
