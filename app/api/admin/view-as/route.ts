// Look at Launch Pad as one of your agents sees it.
//
// The honest way to answer "is this actually landing?". The admin screens can
// tell you an account exists and has campaigns attached, but they can't show
// you what the agent will see when they sign in — whether the numbers are
// real, whether the ads pulled through, whether it looks right.
//
// WHY NOT JUST SIGN IN AS THEM: the pre-provisioned accounts do share a launch
// password, so it's technically possible — but signing in that way BURNS their
// first sign-in. It clears mustResetPassword, drops them off the Send All
// list, and invalidates the invite they were about to receive. This leaves
// their account exactly as it was.
//
// BE CLEAR ABOUT WHAT THIS IS: a real session as that person. Anything done
// while viewing is done as them — a lead marked contacted is really marked
// contacted. It is not a sandbox. The banner is there so that's never
// forgotten, and every use is written to the account's admin notes so it's
// visible afterwards.
//
// Super admin only. An MD can't use it, even on their own brand: seeing a
// colleague's mailbox and leads is a different privilege from managing them.

import { NextRequest, NextResponse } from "next/server";
import { isSuperAdmin } from "@/lib/admin-auth";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { findById, updateUser } from "@/lib/users-store";

export const dynamic = "force-dynamic";

/* Readable by the browser on purpose — the dashboard banner needs it.
   Not exported: Next only allows its own known exports from a route file. */
const VIEWING_COOKIE = "teg_viewing_as";

export async function POST(req: NextRequest) {
  if (!isSuperAdmin(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const userId = String((body as { userId?: string })?.userId ?? "").trim();
  if (!userId) {
    return NextResponse.json({ error: "userId is required." }, { status: 400 });
  }

  const user = await findById(userId);
  if (!user) {
    return NextResponse.json({ error: "No such account." }, { status: 404 });
  }

  // Leave a trace on the account. Impersonation that nobody can see afterwards
  // is the kind of feature that becomes a problem later.
  try {
    await updateUser(user.id, {
      adminNotes: [
        ...(user.adminNotes ?? []),
        {
          at: new Date().toISOString(),
          text: "Viewed by an administrator (view-as).",
        },
      ],
    });
  } catch {
    /* the note is a nicety — never block the view on it */
  }

  const res = NextResponse.json({
    ok: true,
    viewing: { id: user.id, name: user.name, email: user.email },
  });
  res.cookies.set(SESSION_COOKIE, createSessionToken(user.id), sessionCookieOptions());
  // Not pre-encoded: Next encodes cookie values itself, and doing it here too
  // yields %2520 in the banner instead of a space.
  res.cookies.set(VIEWING_COOKIE, user.name || user.email, {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 2,
  });
  return res;
}

/** Stop viewing: drop the agent session and the marker. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  res.cookies.delete(VIEWING_COOKIE);
  return res;
}
