import { NextRequest, NextResponse } from "next/server";
import {
  listUsers,
  findById,
  findByEmail,
  updateUser,
  deleteUser,
  toAdmin,
} from "@/lib/users-store";
import { adminScope } from "@/lib/admin-auth";
import { adsCoveredByLicence } from "@/lib/ads-entitlement";
import type { BrandId } from "@/lib/brands";

// Admin user management. Super admins see every agent; an MD sees (and can
// edit) only agents in their own brand.

// List signed-up agents — all for super, brand-scoped for an MD.
export async function GET(req: NextRequest) {
  const scope = adminScope(req);
  if (!scope) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const all = await listUsers();
  const visible =
    scope.role !== "super" ? all.filter((u) => u.brandId === scope.brandId) : all;
  /* paymentState answers the question James had to open Stripe to ask:
   * "paid" = Stripe confirmed money; "licence" = deliberately unpaid, a
   * Pro licence covers it (the TLE launch partners); "unpaid" = a paid-tier
   * signup that never finished paying — the abandoners. Referral accounts
   * are simply "free". The licence check rides the memoised Team Hub
   * directory, so annotating a few hundred rows costs one directory scan. */
  const annotated = await Promise.all(
    visible.map(async (u) => ({
      ...u,
      paymentState:
        u.accountType === "referral"
          ? "free"
          : u.paid
            ? "paid"
            : (await adsCoveredByLicence(u.email, u.brandId as BrandId))
              ? "licence"
              : "unpaid",
    }))
  );
  return NextResponse.json(annotated);
}

// Update admin-managed fields on an agent, or add an internal note.
// Body: { userId, metaCampaignId?, location?, onboardingStage?, note?,
//         deactivated? }
export async function PATCH(req: NextRequest) {
  const scope = adminScope(req);
  if (!scope) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const userId = String(body?.userId ?? "");
  const current = await findById(userId);
  if (!current) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  // An MD can only touch their own brand's agents.
  // Marketing reads stats; it doesn't manage people.
  if (scope.role === "marketing") {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  if (scope.role === "md" && current.brandId !== scope.brandId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const patch: Record<string, unknown> = {};
  if ("metaCampaignId" in body) {
    patch.metaCampaignId =
      typeof body.metaCampaignId === "string" && body.metaCampaignId.trim()
        ? body.metaCampaignId.trim()
        : null;
  }
  if ("rexUserId" in body) {
    patch.rexUserId =
      typeof body.rexUserId === "string" && body.rexUserId.trim()
        ? body.rexUserId.trim()
        : null;
  }
  if ("location" in body) {
    patch.location =
      typeof body.location === "string" && body.location.trim()
        ? body.location.trim()
        : null;
  }
  if (typeof body?.onboardingStage === "string") {
    patch.onboardingStage = body.onboardingStage;
  }
  /* Lock a leaver out. The login route has always refused a deactivated
     account, but nothing could set the flag — so someone who left kept working
     access to their leads until their account was deleted outright, which also
     loses the history. This is the reversible version: they can't sign in,
     the record stays.

     Reversible on purpose. Deleting is still available separately, and a
     leaver who turns out to be on gardening leave shouldn't cost you the
     lead history. */
  if ("deactivated" in body) {
    patch.deactivatedAt = body.deactivated ? new Date().toISOString() : null;
  }
  if (Array.isArray(body?.campaignAssets)) {
    patch.campaignAssets = body.campaignAssets;
  }
  if (typeof body?.note === "string" && body.note.trim()) {
    patch.adminNotes = [
      ...(current.adminNotes ?? []),
      { at: new Date().toISOString(), text: body.note.trim().slice(0, 1000) },
    ];
  }

  const updated = await updateUser(userId, patch);
  // Return the admin view so the client sees notes/location/stage.
  return NextResponse.json({ user: updated ? toAdmin(updated) : null });
}

// Permanently delete an agent and everything they own (leads cascade via the
// FK). Super only — destructive, so MDs can't remove accounts.
// Body: { userId } or { email } — an admin knows the address, not the id.
export async function DELETE(req: NextRequest) {
  const scope = adminScope(req);
  if (!scope || scope.role !== "super") {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const userId = String(body?.userId ?? "");
  const email = String(body?.email ?? "").trim().toLowerCase();
  if (!userId && !email) {
    return NextResponse.json({ error: "userId or email is required" }, { status: 400 });
  }
  const current = userId ? await findById(userId) : await findByEmail(email);
  if (!current) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  const ok = await deleteUser(current.id);
  return NextResponse.json({ ok, deleted: { name: current.name, email: current.email } });
}
