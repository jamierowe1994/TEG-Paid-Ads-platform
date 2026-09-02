import { NextRequest, NextResponse } from "next/server";
import { adminScope, lookupAdmin } from "@/lib/admin-auth";
import {
  listAdminUsers,
  upsertAdminUser,
  deleteAdminUser,
  findAdminUserById,
  type InvitedRole,
} from "@/lib/admin-users";
import { createAuthToken } from "@/lib/auth-tokens";
import { sendSystemEmail, canSendSystemEmail } from "@/lib/mailer";
import { adminInviteEmail } from "@/lib/emails";
import { appOrigin } from "@/lib/microsoft";
import { brandById, type BrandId } from "@/lib/brands";

/* The admin-centre team: who has been invited in, and inviting more.
 *
 * GET    → everyone invited (super: all brands; MD: their own).
 * POST   → invite someone. Body: { email, name, role, brandId }
 *          Creates (or refreshes) the admin account and emails a magic link.
 *          Re-inviting resends the link; it never resets a password they've
 *          already chosen.
 * DELETE → remove access. Body: { id }
 *
 * Who may invite whom:
 *   super → md or marketing, any brand
 *   md    → marketing only, own brand only
 * Marketing can't invite anyone. Nobody can invite a super admin — that tier
 * is directory-only on purpose.
 */
const TTL_DAYS = 14;

const ROLE_LABEL: Record<InvitedRole, string> = {
  md: "Managing Director",
  marketing: "Marketing",
};

export async function GET(req: NextRequest) {
  const scope = adminScope(req);
  if (!scope || scope.role === "marketing") {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const all = await listAdminUsers();
  const visible =
    scope.role === "super" ? all : all.filter((a) => a.brandId === scope.brandId);
  return NextResponse.json({
    team: visible.map((a) => ({
      id: a.id,
      email: a.email,
      name: a.name,
      role: a.role,
      brandId: a.brandId,
      createdAt: a.createdAt,
      /** They've followed the link and chosen a password. */
      active: !!a.passwordHash,
      lastLoginAt: a.lastLoginAt,
    })),
  });
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
  const email = String(body?.email ?? "").trim().toLowerCase();
  const name = String(body?.name ?? "").trim();
  const role: InvitedRole = body?.role === "md" ? "md" : "marketing";
  const brandId = String(body?.brandId ?? "");

  if (!/^\S+@\S+\.\S+$/.test(email) || !name) {
    return NextResponse.json({ error: "A name and a valid email are needed." }, { status: 400 });
  }
  const brand = brandById(brandId);
  if (!brand) {
    return NextResponse.json({ error: "Pick a business." }, { status: 400 });
  }
  if (scope.role === "md") {
    if (brandId !== scope.brandId) {
      return NextResponse.json({ error: "You can only invite people into your own business." }, { status: 403 });
    }
    if (role !== "marketing") {
      return NextResponse.json({ error: "Only the group can add a Managing Director." }, { status: 403 });
    }
  }
  // Someone already in the hard-coded directory signs in with the shared tier
  // password; inviting them would make two logins for one person.
  if (lookupAdmin(email)) {
    return NextResponse.json(
      { error: "That person already has admin access — they can sign in with their existing details." },
      { status: 409 }
    );
  }

  const invitedBy =
    scope.role === "super" ? "The Experts Group" : (lookupAdmin(scope.email)?.name ?? scope.email);

  const admin = await upsertAdminUser({
    email,
    name,
    role,
    brandId: brand.id as BrandId,
    invitedBy: scope.role === "super" ? "super" : scope.email,
  });

  const raw = await createAuthToken(admin.id, "admin-invite", TTL_DAYS * 24 * 60 * 60 * 1000);
  const link = `${appOrigin()}/admin/setup?token=${encodeURIComponent(raw)}`;
  const mail = adminInviteEmail({
    name,
    link,
    brandName: brand.name,
    roleLabel: ROLE_LABEL[role],
    invitedBy,
    days: TTL_DAYS,
  });
  const sent = await sendSystemEmail({
    to: email,
    subject: mail.subject,
    body: mail.html,
    html: true,
  });
  if (!sent.sent) {
    return NextResponse.json(
      { error: `Account created but the email didn't send: ${sent.detail ?? sent.reason}` },
      { status: 502 }
    );
  }
  return NextResponse.json({ ok: true, id: admin.id, resent: !!admin.passwordHash });
}

export async function DELETE(req: NextRequest) {
  const scope = adminScope(req);
  if (!scope || scope.role === "marketing") {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const id = String(body?.id ?? "");
  const target = await findAdminUserById(id);
  if (!target) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (scope.role === "md" && target.brandId !== scope.brandId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await deleteAdminUser(id);
  return NextResponse.json({ ok: true });
}
