import { NextRequest, NextResponse } from "next/server";
import {
  listUsers,
  findById,
  updateUser,
  deleteUser,
  toAdmin,
} from "@/lib/users-store";
import { adminScope } from "@/lib/admin-auth";

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
    scope.role === "md" ? all.filter((u) => u.brandId === scope.brandId) : all;
  return NextResponse.json(visible);
}

// Update admin-managed fields on an agent, or add an internal note.
// Body: { userId, metaCampaignId?, location?, onboardingStage?, note? }
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
// Body: { userId }
export async function DELETE(req: NextRequest) {
  const scope = adminScope(req);
  if (!scope || scope.role !== "super") {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const userId = String(body?.userId ?? "");
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }
  const current = await findById(userId);
  if (!current) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  const ok = await deleteUser(userId);
  return NextResponse.json({ ok });
}
