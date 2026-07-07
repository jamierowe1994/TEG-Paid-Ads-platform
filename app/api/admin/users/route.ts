import { NextRequest, NextResponse } from "next/server";
import { listUsers, findById, updateUser, toAdmin } from "@/lib/users-store";

// Admin-only user management. Gated by the admin password sent as a bearer
// token — replace with real admin auth later.

function authorised(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const password = process.env.ADMIN_PASSWORD ?? "experts-admin";
  return auth === `Bearer ${password}`;
}

// List every signed-up agent (public profiles, no password hashes).
export async function GET(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  return NextResponse.json(await listUsers());
}

// Update admin-managed fields on an agent, or add an internal note.
// Body: { userId, metaCampaignId?, location?, onboardingStage?, note? }
export async function PATCH(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const userId = String(body?.userId ?? "");
  const current = await findById(userId);
  if (!current) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const patch: Record<string, unknown> = {};
  if ("metaCampaignId" in body) {
    patch.metaCampaignId =
      typeof body.metaCampaignId === "string" && body.metaCampaignId.trim()
        ? body.metaCampaignId.trim()
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
