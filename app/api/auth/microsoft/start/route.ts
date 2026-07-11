import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth";
import { msConfigured, msAuthUrl } from "@/lib/microsoft";

// Kick off the "Connect your email" flow: bounce the signed-in agent to
// Microsoft's consent screen. A random nonce rides in an httpOnly cookie and
// in `state` — the callback only accepts the pair together (CSRF guard).
export async function GET(req: NextRequest) {
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!userId) {
    return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
  }
  if (!msConfigured()) {
    return NextResponse.redirect(
      new URL("/dashboard/profile?email=notconfigured", req.nextUrl.origin)
    );
  }
  const state = crypto.randomBytes(16).toString("hex");
  const res = NextResponse.redirect(msAuthUrl(state));
  // The cookie carries WHO started the flow as well as the nonce — the
  // callback rejects a mismatch, so a session swap mid-flow (shared office
  // machine) can't attach agent A's mailbox to agent B's record.
  res.cookies.set("teg_ms_state", `${state}:${userId}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600, // ten minutes to complete the sign-in
  });
  return res;
}
