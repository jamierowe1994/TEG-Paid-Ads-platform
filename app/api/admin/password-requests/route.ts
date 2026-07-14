import { NextRequest, NextResponse } from "next/server";
import {
  listPendingPasswordRequests,
  markPasswordRequestHandled,
} from "@/lib/password-requests";
import { findByEmail } from "@/lib/users-store";
import { adminScope } from "@/lib/admin-auth";

// Who's locked out and waiting on a temporary password. Super sees everyone;
// an MD sees only their own brand's people.
export async function GET(req: NextRequest) {
  const scope = adminScope(req);
  if (!scope) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const pending = await listPendingPasswordRequests();
  // Resolve each ask to the account behind it, so the admin can act on it
  // straight away (and so an MD's list can be brand-filtered).
  const rows = await Promise.all(
    pending.map(async (r) => {
      const user = await findByEmail(r.email);
      return {
        email: r.email,
        createdAt: r.createdAt,
        userId: user?.id ?? null,
        name: user?.name ?? null,
        brandId: user?.brandId ?? null,
      };
    })
  );
  const visible =
    scope.role === "md"
      ? rows.filter((r) => r.brandId === scope.brandId)
      : rows;
  return NextResponse.json({ requests: visible });
}

// Clear an ask once the team has sorted them out. Body: { email }
export async function POST(req: NextRequest) {
  const scope = adminScope(req);
  if (!scope) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }
  // An MD can only clear their own brand's people.
  if (scope.role === "md") {
    const user = await findByEmail(email);
    if (!user || user.brandId !== scope.brandId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }
  await markPasswordRequestHandled(email);
  return NextResponse.json({ ok: true });
}
