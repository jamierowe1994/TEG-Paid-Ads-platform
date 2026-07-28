import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth";
import { findById, updateUser, toPublic } from "@/lib/users-store";
import { packageById } from "@/lib/packages";
import { getStripe, lineItemsFor, stripeConfigured } from "@/lib/stripe";

/* Change the ad-spend tier on an existing subscription. Body: { packageId }
 *
 * The partner pack promises you can "adjust at any renewal", so this uses
 * proration_behavior: "none". The subscription moves to the new price, but
 * Stripe raises no immediate charge or credit — the new amount simply appears
 * on the next invoice. Charging a part-month top-up on the spot would be a
 * different promise from the one on the pricing page.
 *
 * The management line is left alone: it's the same £100 on every package, so
 * only the ad-spend item is swapped.
 */
export async function POST(req: NextRequest) {
  const id = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!id) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const user = await findById(id);
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const pkg = packageById(body?.packageId);
  if (!pkg) {
    return NextResponse.json({ error: "Pick a package." }, { status: 400 });
  }
  if (pkg.id === packageById(user.packageId)?.id) {
    return NextResponse.json(
      { error: `You're already on ${pkg.name}.` },
      { status: 400 }
    );
  }

  // No Stripe (or no subscription): record the choice so the portal stays
  // usable in demo mode, exactly as signup and upgrade do.
  if (!stripeConfigured() || !user.stripeSubscriptionId) {
    const updated = await updateUser(id, { packageId: pkg.id });
    if (!updated) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }
    return NextResponse.json({ user: toPublic(updated) });
  }

  const resolved = lineItemsFor(pkg.id);
  if (!resolved.ok) {
    return NextResponse.json(
      { error: `Payments aren't configured — missing ${resolved.missing.join(", ")}.` },
      { status: 503 }
    );
  }
  // lineItemsFor returns [management, adSpend] in that order.
  const newAdSpendPrice = resolved.items[1].price;
  const managementPrice = resolved.items[0].price;

  const stripe = getStripe();

  try {
    const sub = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);

    // Find the ad-spend line by elimination rather than by position: the
    // order Stripe returns items in isn't guaranteed to match how we sent
    // them, and swapping the management fee by mistake would be expensive.
    const adSpendItem = sub.items.data.find(
      (i) => i.price.id !== managementPrice
    );
    if (!adSpendItem) {
      return NextResponse.json(
        { error: "Couldn't find the ad spend line on your subscription." },
        { status: 502 }
      );
    }

    await stripe.subscriptions.update(user.stripeSubscriptionId, {
      items: [{ id: adSpendItem.id, price: newAdSpendPrice }],
      proration_behavior: "none",
      metadata: { ...(sub.metadata ?? {}), packageId: pkg.id },
    });
  } catch (err) {
    console.error("[stripe] package change failed:", err);
    return NextResponse.json(
      { error: "Couldn't update your subscription. Please try again." },
      { status: 502 }
    );
  }

  const updated = await updateUser(id, { packageId: pkg.id });
  if (!updated) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  return NextResponse.json({
    user: toPublic(updated),
    effectiveFrom: user.renewsAt ?? null,
  });
}
