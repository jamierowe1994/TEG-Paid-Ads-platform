import { NextRequest, NextResponse } from "next/server";
import {
  hashPassword,
  createSessionToken,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth";
import { findByEmail, createUser, toPublic } from "@/lib/users-store";
import { brandForEmail, brandById, isAllowedEmailDomain } from "@/lib/brands";
import { packageById } from "@/lib/packages";
import { stripeConfigured } from "@/lib/stripe";
import { adsCoveredByLicence } from "@/lib/ads-entitlement";
import { savePendingSignup } from "@/lib/pending-signups";
import type { BrandId } from "@/lib/brands";
import type { StoredUser } from "@/lib/users-store";

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const name = String(body.name ?? "").trim();

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }
  // Internal portal: only Experts Group brand (and head-office) domains may
  // register. Anyone else is declined here.
  if (!isAllowedEmailDomain(email)) {
    return NextResponse.json(
      {
        error:
          "This is an internal portal for The Experts Group. Please register with your company email address (e.g. yourname@therecruitmentexperts.co.uk). If you believe this is a mistake, contact your head office.",
        code: "domain",
      },
      { status: 403 }
    );
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 }
    );
  }
  if (await findByEmail(email)) {
    return NextResponse.json(
      { error: "An account with that email already exists. Sign in instead." },
      { status: 409 }
    );
  }

  // Resolve the brand from the email domain, falling back to a chosen brandId.
  const brand = brandForEmail(email) ?? brandById(body.brandId);
  if (!brand) {
    return NextResponse.json(
      { error: "Could not determine your business" },
      { status: 400 }
    );
  }

  // "referral" = the free, referrals-only tier; "paid" = the full paid-ads
  // system. Anything else defaults to paid.
  const accountType = body.accountType === "referral" ? "referral" : "paid";

  const passwordHash = hashPassword(password);
  const packageId = packageById(body.packageId)?.id ?? "starter";
  const platforms = Array.isArray(body.platforms) ? body.platforms : [];
  const mobile = String(body.mobile ?? "").trim();
  const photo = typeof body.photo === "string" ? body.photo : null;
  const goal = String(body.goal ?? "");

  /* Does this person owe us money before they get an account?
   *
   * Three ways the answer is no, and each is a real person:
   *   · referrals-only accounts are free;
   *   · a TLE Pro licence already includes Paid Ads, so charging would be
   *     charging twice;
   *   · Stripe not being configured at all, where demanding payment would
   *     lock everybody out of a portal with no way to pay.
   *
   * Everyone else waits. Their details are parked, and the account is created
   * by the Stripe webhook once the money clears — see lib/pending-signups.ts
   * for why that's worth the extra moving part.
   */
  const mustPayFirst =
    accountType === "paid" &&
    stripeConfigured() &&
    !(await adsCoveredByLicence(email, brand.id as BrandId));

  if (mustPayFirst) {
    const pending = await savePendingSignup({
      name,
      email,
      mobile,
      photo,
      brandId: brand.id,
      platforms,
      goal,
      packageId,
      passwordHash,
    });
    // No account, no session cookie, and nothing sent to the team. There is
    // nothing yet to have an account of.
    return NextResponse.json({
      pending: true,
      pendingId: pending.id,
      packageId: pending.packageId,
    });
  }

  const user: StoredUser = {
    id: uid(),
    name,
    email,
    mobile,
    photo,
    brandId: brand.id,
    platforms,
    goal,
    packageId,
    // Free by entitlement (a Pro licence) or by tier (referrals-only), or
    // Stripe isn't configured so nobody can pay for anything. Paid access is
    // still only ever granted by the Stripe webhook.
    paid: accountType === "paid" && !stripeConfigured(),
    accountType,
    createdAt: new Date().toISOString(),
    passwordHash,
    location: null,
    onboardingStage: "signed_up",
    adminNotes: [],
  };

  await createUser(user);

  /* No "new signup" email from here any more. It used to fire for everyone
     who reached this line, including the people who then walked away from
     the card page — which is exactly why the number Hayley was watching
     never matched the money. The email now goes out from
     materialisePendingSignup, once, after Stripe confirms payment. */

  const res = NextResponse.json({ user: toPublic(user) });
  res.cookies.set(
    SESSION_COOKIE,
    createSessionToken(user.id),
    sessionCookieOptions()
  );
  return res;
}
