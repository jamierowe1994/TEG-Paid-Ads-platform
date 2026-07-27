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

  const user: StoredUser = {
    id: uid(),
    name,
    email,
    mobile: String(body.mobile ?? "").trim(),
    photo: typeof body.photo === "string" ? body.photo : null,
    brandId: brand.id,
    platforms: Array.isArray(body.platforms) ? body.platforms : [],
    goal: String(body.goal ?? ""),
    packageId: packageById(body.packageId)?.id ?? "starter",
    // Paid access is granted by the Stripe webhook, never here — finishing
    // checkout in the browser isn't proof that the card cleared.
    //
    // The exception is when Stripe isn't configured at all: without it there
    // is no way to ever pay, so a new account would be locked out of the
    // portal it just signed up for. Keeping the old demo behaviour in that
    // case means adding the keys is what switches real billing on, rather
    // than a deploy that silently locks everybody out.
    // Referral-only accounts are free, so they're never "paid".
    paid: accountType === "paid" && !stripeConfigured(),
    accountType,
    createdAt: new Date().toISOString(),
    passwordHash: hashPassword(password),
    location: null,
    onboardingStage: "signed_up",
    adminNotes: [],
  };

  await createUser(user);

  const res = NextResponse.json({ user: toPublic(user) });
  res.cookies.set(
    SESSION_COOKIE,
    createSessionToken(user.id),
    sessionCookieOptions()
  );
  return res;
}
