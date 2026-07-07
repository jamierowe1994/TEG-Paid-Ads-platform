import { NextRequest, NextResponse } from "next/server";
import { listUsers, findById, updateUser, toPublic } from "@/lib/users-store";

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

// Update admin-managed fields on an agent. Currently: the Meta campaign ID
// that links the agent to their ad campaign ({ userId, metaCampaignId }).
export async function PATCH(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const userId = String(body?.userId ?? "");
  if (!(await findById(userId))) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  const metaCampaignId =
    typeof body?.metaCampaignId === "string" && body.metaCampaignId.trim()
      ? body.metaCampaignId.trim()
      : null;
  const updated = await updateUser(userId, { metaCampaignId });
  return NextResponse.json({ user: updated ? toPublic(updated) : null });
}
