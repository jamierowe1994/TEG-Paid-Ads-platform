import { NextRequest, NextResponse } from "next/server";
import { isAllowedEmailDomain } from "@/lib/brands";
import { findByEmail } from "@/lib/users-store";
import { requestPasswordReset } from "@/lib/password-requests";

// "I've forgotten my password" from the login page. No system mailbox exists
// yet, so we can't email a reset link — the ask is logged for the team, who
// issue a temporary password from the agent's profile.
//
// Deliberately always answers the same way: never reveal whether an address
// has an account (that would let anyone enumerate staff emails). Only a real,
// Experts-Group account actually records an ask.
// Body: { email }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json(
      { error: "That doesn't look like an email address." },
      { status: 400 }
    );
  }
  // Staff-only, same gate as signing in.
  if (!isAllowedEmailDomain(email)) {
    return NextResponse.json({ error: "domain" }, { status: 403 });
  }

  try {
    const user = await findByEmail(email);
    if (user) await requestPasswordReset(email);
  } catch {
    /* never leak a lookup failure back to the form */
  }

  return NextResponse.json({ ok: true });
}
