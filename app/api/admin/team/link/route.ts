import { NextRequest, NextResponse } from "next/server";
import { adminScope, lookupAdmin, adoptDirectoryAdmin } from "@/lib/admin-auth";
import { findAdminUserByEmail } from "@/lib/admin-users";
import { createAuthToken } from "@/lib/auth-tokens";
import { appOrigin } from "@/lib/microsoft";

/* A magic link for an admin, handed back to the screen rather than emailed.
 *
 * Body: { email }  →  { link, days }
 *
 * For pasting into WhatsApp or a Teams message when email isn't the right
 * channel, and for "reset their password" — following the link is how a
 * password gets set, so the two are the same action. Issuing a new link
 * kills any older one for that person (see createAuthToken).
 *
 * Super: anyone. MD: their own business only, and never a group admin.
 */
const TTL_DAYS = 14;

export async function POST(req: NextRequest) {
  const scope = adminScope(req);
  if (!scope || scope.role === "marketing") {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const email = String(body?.email ?? "").trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  const entry = lookupAdmin(email);
  const admin = entry ? await adoptDirectoryAdmin(entry) : await findAdminUserByEmail(email);
  if (!admin) {
    return NextResponse.json({ error: "No admin with that email." }, { status: 404 });
  }
  if (scope.role === "md" && (admin.role === "super" || admin.brandId !== scope.brandId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const raw = await createAuthToken(admin.id, "admin-invite", TTL_DAYS * 24 * 60 * 60 * 1000);
  return NextResponse.json({
    link: `${appOrigin()}/admin/setup?token=${encodeURIComponent(raw)}`,
    days: TTL_DAYS,
  });
}
