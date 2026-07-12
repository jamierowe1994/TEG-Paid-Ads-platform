import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth";
import { findById, deleteUser } from "@/lib/users-store";

// The agent permanently deletes their own account (and everything it owns —
// leads cascade). Requires typing their exact email to confirm, so it can't
// happen by accident. Body: { confirm: "<their email>" }
export async function POST(req: NextRequest) {
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const user = await findById(userId);
  if (!user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const confirm = String(body?.confirm ?? "").trim().toLowerCase();
  if (confirm !== user.email.trim().toLowerCase()) {
    return NextResponse.json(
      { error: "Type your email exactly to confirm." },
      { status: 400 }
    );
  }
  await deleteUser(userId);
  // Clear their session on the way out.
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return res;
}
