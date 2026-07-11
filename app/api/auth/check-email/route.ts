import { NextRequest, NextResponse } from "next/server";
import { findByEmail } from "@/lib/users-store";
import { isAllowedEmailDomain } from "@/lib/brands";

// Lightweight "is this email already registered?" check, used by the signup
// wizard to catch a returning user AT THE EMAIL STEP rather than after they've
// filled in the whole form. Internal portal (domain-gated), so surfacing that
// an account exists is acceptable — the full signup already reveals it.
// Body: { email } → { exists, allowed }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ exists: false, allowed: false });
  }
  const allowed = isAllowedEmailDomain(email);
  const exists = allowed ? !!(await findByEmail(email)) : false;
  return NextResponse.json({ exists, allowed });
}
