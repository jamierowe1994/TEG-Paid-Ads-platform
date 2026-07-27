import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth";
import { findById, setCancelRequested, toPublic } from "@/lib/users-store";
import { getStripe, stripeConfigured } from "@/lib/stripe";

/* Cancel (or resume) the subscription. Body: { cancel: boolean }
 *
 * This used to only set a flag and notify the team — nothing reached Stripe,
 * so after a cancellation the customer kept being charged until somebody
 * remembered to do it by hand.
 *
 * It now sets cancel_at_period_end on the real subscription, which is what the
 * partner pack promises: the plan runs to the end of the period already paid
 * for, then stops. Resuming clears the same flag.
 *
 * The three-month minimum is enforced HERE, not just in the UI. Hiding a
 * button is a courtesy; this is the actual rule, and the API is what anyone
 * determined would call instead.
 */
export async function POST(req: NextRequest) {
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const user = await findById(userId);
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const cancel = body?.cancel !== false; // default: request cancellation

  // The minimum term blocks cancelling. It must never block resuming.
  if (cancel && user.commitmentEndsAt) {
    const ends = new Date(user.commitmentEndsAt);
    if (ends.getTime() > Date.now()) {
      return NextResponse.json(
        {
          error: `You're inside the three-month minimum term, which runs until ${ends.toLocaleDateString(
            "en-GB",
            { day: "numeric", month: "long", year: "numeric" }
          )}.`,
          commitmentEndsAt: user.commitmentEndsAt,
        },
        { status: 409 }
      );
    }
  }

  // Tell Stripe FIRST: if that fails we must not leave the account showing
  // "cancelling" while the card quietly keeps being charged.
  if (stripeConfigured() && user.stripeSubscriptionId) {
    try {
      await getStripe().subscriptions.update(user.stripeSubscriptionId, {
        cancel_at_period_end: cancel,
      });
    } catch (err) {
      console.error("[stripe] cancel toggle failed:", err);
      return NextResponse.json(
        { error: "Couldn't update your subscription with the payment provider." },
        { status: 502 }
      );
    }
    // The subscription.updated webhook mirrors this back as well; setting it
    // here too means the UI is correct immediately rather than after a round
    // trip through Stripe.
  }

  const updated = await setCancelRequested(
    userId,
    cancel ? new Date().toISOString() : null
  );
  if (!updated) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, user: toPublic(updated) });
}
