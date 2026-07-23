import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { adminScope } from "@/lib/admin-auth";
import { hashPassword } from "@/lib/auth";
import { findByEmail, createUser, type StoredUser } from "@/lib/users-store";
import { brandById } from "@/lib/brands";

// One-time launch import: pre-provision a referrals-only account for everyone
// in the group. The admin uploads a list (CSV mapped client-side), everyone is
// created with the shared launch password and mustResetPassword on — their
// first sign-in forces them to set their own before the portal opens up.
//
// Invite emails go out via leads@theexpertsgroup.co.uk once that mailbox is
// wired up (TODO.md item 3) — until then the import just creates the accounts.

const LAUNCH_PASSWORD = "TEG2026";

function uid() {
  return crypto.randomBytes(8).toString("hex").slice(0, 16);
}

interface ImportRow {
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  brandId: string;
}

export async function POST(req: NextRequest) {
  const scope = adminScope(req);
  // Bulk account creation is a super-admin-only action.
  if (!scope || scope.role !== "super") {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const rows: ImportRow[] = Array.isArray(body?.rows) ? body.rows : [];
  if (rows.length === 0) {
    return NextResponse.json({ error: "No rows to import" }, { status: 400 });
  }
  if (rows.length > 1000) {
    return NextResponse.json(
      { error: "That's more than 1,000 rows — split the file" },
      { status: 400 }
    );
  }

  // One shared hash for the launch password — no need to scrypt 300 times.
  const launchHash = hashPassword(LAUNCH_PASSWORD);

  const created: string[] = [];
  const skipped: { email: string; reason: string }[] = [];
  const seen = new Set<string>();

  for (const raw of rows) {
    const email = String(raw.email ?? "").trim().toLowerCase();
    const firstName = String(raw.firstName ?? "").trim();
    const lastName = String(raw.lastName ?? "").trim();
    const name = `${firstName} ${lastName}`.trim();
    const brand = brandById(String(raw.brandId ?? ""));

    if (!email || !email.includes("@")) {
      skipped.push({ email: email || "(blank)", reason: "invalid email" });
      continue;
    }
    if (seen.has(email)) {
      skipped.push({ email, reason: "duplicate row in file" });
      continue;
    }
    seen.add(email);
    if (!name) {
      skipped.push({ email, reason: "missing name" });
      continue;
    }
    if (!brand) {
      skipped.push({ email, reason: "unrecognised brand" });
      continue;
    }
    if (await findByEmail(email)) {
      skipped.push({ email, reason: "account already exists" });
      continue;
    }

    const user: StoredUser = {
      id: uid(),
      name,
      email,
      mobile: String(raw.mobile ?? "").trim(),
      photo: null,
      brandId: brand.id,
      platforms: [],
      goal: "",
      packageId: "starter",
      paid: false,
      accountType: "referral",
      mustResetPassword: true,
      createdAt: new Date().toISOString(),
      passwordHash: launchHash,
      location: null,
      onboardingStage: "signed_up",
      adminNotes: [],
    };
    await createUser(user);
    created.push(email);
  }

  return NextResponse.json({
    created: created.length,
    createdEmails: created,
    skipped,
  });
}
