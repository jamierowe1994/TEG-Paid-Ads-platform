import { NextRequest, NextResponse } from "next/server";
import { adminScope, lookupAdmin, directoryEntries, adoptDirectoryAdmin } from "@/lib/admin-auth";
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

/* The admin-centre team.
 *
 * GET    → EVERY admin: the hard-coded directory (super, the launch MDs,
 *          Francesca) merged with everyone invited since. One list, so "who
 *          can see this business's admin centre?" has one answer. Directory
 *          people who've never signed in since this shipped show as such.
 * POST   → invite someone. Body: { email, name, role, brandId }
 *          For a directory email this doesn't refuse any more — it adopts
 *          them and sends a magic link, which is what "invite" meant.
 * DELETE → remove an INVITED admin. Directory people can't be removed here;
 *          they're a line in lib/admin-auth.ts.
 *
 * Who may invite whom:
 *   super → md or marketing, any brand
 *   md    → marketing only, own brand only
 */
const TTL_DAYS = 14;

const ROLE_LABEL: Record<string, string> = {
  super: "Group admin",
  md: "Managing Director",
  marketing: "Marketing",
};

interface TeamRow {
  id: string | null;
  email: string;
  name: string;
  role: "super" | "md" | "marketing";
  brandId: string | null;
  /** "directory" = hard-coded, signs in with the tier password (or their own
      once set); "invited" = created from the Invite tab. */
  source: "directory" | "invited";
  /** They can sign in right now: a directory person, or an invitee who has
      set a password. */
  canSignIn: boolean;
  ownPassword: boolean;
  lastLoginAt: string | null;
  createdAt: string | null;
}

export async function GET(req: NextRequest) {
  const scope = adminScope(req);
  if (!scope || scope.role === "marketing") {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const stored = await listAdminUsers();
  const byEmail = new Map(stored.map((a) => [a.email, a]));
  const rows: TeamRow[] = [];

  for (const e of directoryEntries()) {
    const row = byEmail.get(e.email);
    byEmail.delete(e.email);
    rows.push({
      id: row?.id ?? null,
      email: e.email,
      name: e.name ?? row?.name ?? e.email,
      role: e.role,
      brandId: e.brandId ?? null,
      source: "directory",
      canSignIn: true,
      ownPassword: !!row?.passwordHash,
      lastLoginAt: row?.lastLoginAt ?? null,
      createdAt: row?.createdAt ?? null,
    });
  }
  for (const a of byEmail.values()) {
    rows.push({
      id: a.id,
      email: a.email,
      name: a.name,
      role: a.role,
      brandId: a.brandId,
      source: "invited",
      canSignIn: !!a.passwordHash,
      ownPassword: !!a.passwordHash,
      lastLoginAt: a.lastLoginAt,
      createdAt: a.createdAt,
    });
  }

  const visible =
    scope.role === "super" ? rows : rows.filter((r) => r.brandId === scope.brandId);
  return NextResponse.json({ team: visible });
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
  let name = String(body?.name ?? "").trim();
  let role: InvitedRole | "super" = body?.role === "md" ? "md" : "marketing";
  let brandId = String(body?.brandId ?? "");

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ error: "A valid email is needed." }, { status: 400 });
  }

  // Already in the directory: the directory decides their role and brand,
  // and this becomes "send them a link" rather than "create them".
  const entry = lookupAdmin(email);
  let admin;
  if (entry) {
    if (scope.role === "md" && entry.brandId !== scope.brandId) {
      return NextResponse.json({ error: "They aren't in your business." }, { status: 403 });
    }
    admin = await adoptDirectoryAdmin(entry);
    name = admin.name;
    role = entry.role;
    brandId = entry.brandId ?? "";
  } else {
    if (!name) {
      return NextResponse.json({ error: "A name is needed." }, { status: 400 });
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
    admin = await upsertAdminUser({
      email,
      name,
      role,
      brandId: brand.id as BrandId,
      invitedBy: scope.role === "super" ? "super" : scope.email,
    });
  }

  const invitedBy =
    scope.role === "super" ? "The Experts Group" : (lookupAdmin(scope.email)?.name ?? scope.email);
  const raw = await createAuthToken(admin.id, "admin-invite", TTL_DAYS * 24 * 60 * 60 * 1000);
  const link = `${appOrigin()}/admin/setup?token=${encodeURIComponent(raw)}`;
  const mail = adminInviteEmail({
    name,
    link,
    brandName: brandId ? (brandById(brandId)?.name ?? brandId) : "The Experts Group",
    roleLabel: ROLE_LABEL[role],
    invitedBy,
    days: TTL_DAYS,
  });
  const sent = await sendSystemEmail({ to: email, subject: mail.subject, body: mail.html, html: true });
  if (!sent.sent) {
    return NextResponse.json(
      { error: `Set up, but the email didn't send: ${sent.detail ?? sent.reason}` },
      { status: 502 }
    );
  }
  return NextResponse.json({ ok: true, id: admin.id, existing: !!entry || !!admin.passwordHash });
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
  if (lookupAdmin(target.email)) {
    return NextResponse.json(
      { error: "They're in the built-in directory — that's a code change, not a button." },
      { status: 409 }
    );
  }
  if (scope.role === "md" && target.brandId !== scope.brandId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await deleteAdminUser(id);
  return NextResponse.json({ ok: true });
}
