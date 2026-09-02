import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { adminScope, lookupAdmin } from "@/lib/admin-auth";
import { findByEmail, createUser, type StoredUser } from "@/lib/users-store";
import { hashPassword } from "@/lib/auth";
import { createAuthToken } from "@/lib/auth-tokens";
import { sendSystemEmail, canSendSystemEmail } from "@/lib/mailer";
import { inviteEmail } from "@/lib/emails";
import { appOrigin } from "@/lib/microsoft";
import { brandById, isAllowedEmailDomain, type BrandId } from "@/lib/brands";
import { addLaunchExtra } from "@/lib/launch-list-extra";

/* Invite an agent from the admin centre.
 *
 * Body: { name, email, brandId, licence? }
 *
 * Makes a dormant account (no usable password until they follow the link)
 * and emails the same magic link the launch invites used. This is the one
 * way an account can exist without a payment — and it's deliberate: the
 * person doing the inviting is vouching for them. It still grants NOTHING:
 * `paid` stays false, so unless a licence covers their brand they meet the
 * finish-payment screen on first sign-in, exactly as a self-serve signup
 * would. No back door.
 *
 * `licence: true` (Lettings only) adds them to the TLE Pro roster, which is
 * what makes their Paid Ads free — the same thing the old launch tab's "Add"
 * did. It's a checkbox, not the default, because ticking it gives product
 * away and should be a decision.
 */
const TTL_DAYS = 14;

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export async function POST(req: NextRequest) {
  const scope = adminScope(req);
  if (!scope || scope.role === "marketing") {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  if (!(await canSendSystemEmail())) {
    return NextResponse.json(
      { error: "No email transport configured — check Connections." },
      { status: 503 }
    );
  }
  const body = await req.json().catch(() => ({}));
  const name = String(body?.name ?? "").trim();
  const email = String(body?.email ?? "").trim().toLowerCase();
  const brandId = String(body?.brandId ?? "");
  const licence = body?.licence === true;

  if (!name || !/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ error: "A name and a valid email are needed." }, { status: 400 });
  }
  if (!isAllowedEmailDomain(email)) {
    return NextResponse.json(
      { error: "That isn't an Experts Group email address." },
      { status: 400 }
    );
  }
  const brand = brandById(brandId);
  if (!brand) {
    return NextResponse.json({ error: "Pick a business." }, { status: 400 });
  }
  if (scope.role === "md" && brandId !== scope.brandId) {
    return NextResponse.json({ error: "You can only invite people into your own business." }, { status: 403 });
  }
  if (await findByEmail(email)) {
    return NextResponse.json(
      { error: "They already have an account. Open them in People to resend a password link." },
      { status: 409 }
    );
  }

  const user: StoredUser = {
    id: uid(),
    name,
    email,
    mobile: "",
    photo: null,
    brandId: brand.id as BrandId,
    platforms: [],
    goal: "",
    packageId: "starter",
    paid: false,
    accountType: "paid",
    createdAt: new Date().toISOString(),
    // Unguessable and never told to anyone — the magic link replaces it.
    passwordHash: hashPassword(crypto.randomBytes(24).toString("base64url")),
    mustResetPassword: true,
    location: null,
    onboardingStage: "signed_up",
    adminNotes: [],
  };
  await createUser(user);

  if (licence && brand.id === "lettings") {
    await addLaunchExtra({
      email,
      name,
      brandId: "lettings",
      addedBy: scope.role === "super" ? "super" : (lookupAdmin(scope.email)?.name ?? scope.email),
    });
  }

  const token = await createAuthToken(user.id, "invite", TTL_DAYS * 86_400_000);
  const link = `${appOrigin()}/reset/${token}?invite=1`;
  const mail = inviteEmail({ name, link, brandName: brand.name, days: TTL_DAYS });
  const res = await sendSystemEmail({ to: email, subject: mail.subject, body: mail.html, html: true });
  if (!res.sent) {
    return NextResponse.json(
      { error: `Account made but the email didn't send: ${res.detail ?? res.reason}` },
      { status: 502 }
    );
  }
  return NextResponse.json({ ok: true, userId: user.id });
}
