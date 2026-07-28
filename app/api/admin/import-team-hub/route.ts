import { NextRequest, NextResponse } from "next/server";
import { isSuperAdmin } from "@/lib/admin-auth";
import { hashPassword } from "@/lib/auth";
import { findByEmail, createUser, type StoredUser } from "@/lib/users-store";
import { allPartnersForImport, teamHubConfigured } from "@/lib/team-hub";
import { brandForEmail } from "@/lib/brands";

/* Provision portal accounts straight from the Team Hub (Base44), so nobody
 * has to keep a staff CSV in step with the real directory.
 *
 * GET   → dry run. Who WOULD be created, and who'd be skipped and why.
 * POST  → actually create them.
 *
 * NO EMAIL IS EVER SENT FROM HERE. Accounts are created dormant: referrals
 * tier, the shared launch password, and mustResetPassword set. Inviting is a
 * separate, deliberate action per brand (/api/admin/send-invites) so a brand
 * can go live when it's ready rather than 260 people being emailed at once by
 * an accidental click.
 *
 * Brand is decided by email domain — the same rule signup uses — rather than
 * Base44's own brand id, so an account can never be created that its owner
 * would then be refused entry to.
 */

const LAUNCH_PASSWORD = "TEG2026";

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

async function plan() {
  const partners = await allPartnersForImport();

  const create: { name: string; email: string; brandId: string }[] = [];
  const skip: { email: string; name: string; reason: string }[] = [];

  for (const p of partners) {
    const brand = brandForEmail(p.email);
    if (!brand) {
      skip.push({
        email: p.email,
        name: p.name,
        reason: `domain not recognised (${p.email.split("@")[1]})`,
      });
      continue;
    }
    if (await findByEmail(p.email)) {
      skip.push({ email: p.email, name: p.name, reason: "already has an account" });
      continue;
    }
    // Two Team Hub records sharing an address would otherwise both be created
    // and the second would fail on the unique email.
    if (create.some((c) => c.email === p.email)) {
      skip.push({ email: p.email, name: p.name, reason: "duplicate in Team Hub" });
      continue;
    }
    create.push({ name: p.name, email: p.email, brandId: brand.id });
  }

  const byBrand: Record<string, number> = {};
  for (const c of create) byBrand[c.brandId] = (byBrand[c.brandId] ?? 0) + 1;

  return { total: partners.length, create, skip, byBrand };
}

export async function GET(req: NextRequest) {
  if (!isSuperAdmin(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  if (!teamHubConfigured()) {
    return NextResponse.json({ error: "Team Hub isn't configured." }, { status: 503 });
  }
  const p = await plan();
  return NextResponse.json({
    dryRun: true,
    partnersFound: p.total,
    wouldCreate: p.create.length,
    wouldSkip: p.skip.length,
    byBrand: p.byBrand,
    skip: p.skip,
  });
}

export async function POST(req: NextRequest) {
  if (!isSuperAdmin(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  if (!teamHubConfigured()) {
    return NextResponse.json({ error: "Team Hub isn't configured." }, { status: 503 });
  }

  const p = await plan();
  const launchHash = hashPassword(LAUNCH_PASSWORD);
  const created: string[] = [];

  for (const c of p.create) {
    const user: StoredUser = {
      id: uid(),
      name: c.name,
      email: c.email,
      mobile: "",
      photo: null,
      brandId: c.brandId as StoredUser["brandId"],
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
      adminNotes: [
        { at: new Date().toISOString(), text: "Imported from Team Hub" },
      ],
    };
    await createUser(user);
    created.push(c.email);
  }

  return NextResponse.json({
    created: created.length,
    skipped: p.skip.length,
    byBrand: p.byBrand,
    skip: p.skip,
    note: "No emails sent. Invite each brand from the Invites tab when it's ready to go live.",
  });
}
