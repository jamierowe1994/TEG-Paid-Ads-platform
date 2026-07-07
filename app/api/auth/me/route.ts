import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth";
import { findById, updateUser, toPublic } from "@/lib/users-store";

async function currentUserId(req: NextRequest): Promise<string | null> {
  return verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
}

// Return the signed-in user (validates the session cookie server-side).
export async function GET(req: NextRequest) {
  const id = await currentUserId(req);
  if (!id) return NextResponse.json({ user: null }, { status: 401 });
  const user = await findById(id);
  if (!user) return NextResponse.json({ user: null }, { status: 401 });
  return NextResponse.json({ user: toPublic(user) });
}

// Update editable profile fields (name, mobile, photo).
export async function PATCH(req: NextRequest) {
  const id = await currentUserId(req);
  if (!id) return NextResponse.json({ user: null }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (typeof body.name === "string") patch.name = body.name.trim();
  if (typeof body.mobile === "string") patch.mobile = body.mobile.trim();
  if (typeof body.photo === "string" || body.photo === null)
    patch.photo = body.photo;

  const updated = await updateUser(id, patch);
  if (!updated) return NextResponse.json({ user: null }, { status: 401 });
  return NextResponse.json({ user: toPublic(updated) });
}
