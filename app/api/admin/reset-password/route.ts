import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { hashPassword } from "@/lib/auth";
import { findById, updateUser } from "@/lib/users-store";

// Admin resets an agent's password. Returns a readable temporary password
// for the admin to pass on.
//
// TODO(email): once the info@theexpertsgroup mailbox is connected, send the
// temporary password to the agent automatically ("Sorry you got locked out —
// here's a new password...") instead of returning it to the admin screen.

function tempPassword(): string {
  // Readable but strong enough for a forced first-login change later,
  // e.g. "Experts-k3v9qt"
  const chunk = crypto.randomBytes(4).toString("base64url").toLowerCase().slice(0, 6);
  return `Experts-${chunk}`;
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const password = process.env.ADMIN_PASSWORD ?? "experts-admin";
  if (auth !== `Bearer ${password}`) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const userId = String(body?.userId ?? "");
  const user = await findById(userId);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const newPassword = tempPassword();
  await updateUser(userId, { passwordHash: hashPassword(newPassword) });

  return NextResponse.json({
    ok: true,
    email: user.email,
    // Shown once to the admin; not stored anywhere in plain text.
    temporaryPassword: newPassword,
  });
}
