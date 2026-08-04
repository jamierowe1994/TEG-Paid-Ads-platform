// Pre-provision the TLE Pro partners with their live Meta campaigns attached,
// ready for the V1 launch.
//
// The point: a Pro partner signs in on launch day and their real campaign,
// spend and leads are already there, rather than an empty dashboard they have
// to be walked through. Their ads are already running — we're connecting to
// them, not creating anything.
//
// Accounts are created DORMANT and NO EMAIL IS EVER SENT FROM HERE. Inviting is
// a separate, deliberate step (`/api/admin/send-invites`), so provisioning can
// be done and checked well ahead of the launch without anyone being told.
//
// GET  → dry run: exactly what would happen, per person, changing nothing.
// POST → do it. Requires ?confirm=yes so it can't fire from a stray click.
//
// TWO THINGS ARE VERIFIED RATHER THAN TRUSTED, because both fail expensively:
//
//  1. Pro status is re-checked against Team Hub. The uploaded list decides who
//     we ATTEMPT, never who is entitled — otherwise a typo in a spreadsheet
//     grants free Paid Ads.
//  2. Campaign ids are read back from Meta with their real names and status.
//     A wrong id doesn't fail loudly; it silently shows one partner another
//     partner's leads and spend. The dry run prints the campaign NAME against
//     each person precisely so that's caught by eye before anyone signs in.
//
// Note on ad accounts: these partners each have their OWN Meta ad account, and
// that needs no configuration here. Campaign ids resolve to their home account
// via Meta's own `account_id` (see resolveTaggedId in lib/meta.ts), so stats
// follow each campaign to whichever account it lives in. What DOES matter is
// that the System User token can see those ad accounts — if it can't, the
// campaign lookup below returns an error string and the dry run will show it.

import { NextRequest, NextResponse } from "next/server";
import { isSuperAdmin } from "@/lib/admin-auth";
import { findByEmail, createUser, updateUser, type StoredUser } from "@/lib/users-store";
import { hashPassword } from "@/lib/auth";
import { packageForEmail } from "@/lib/team-hub";
import { getCampaignsInfo, parseCampaignIds, metaTokenSet } from "@/lib/meta";

export const dynamic = "force-dynamic";

// Same shared launch password the Team Hub import uses — these accounts are
// created with mustResetPassword, so it's only ever good for the first sign-in.
const LAUNCH_PASSWORD = "TEG2026";
const BRAND_ID = "lettings";

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

interface Entry {
  email: string;
  name?: string;
  campaignIds: string;
}

type Action = "create" | "update" | "skip";

interface PlannedRow {
  email: string;
  action: Action;
  reason: string;
  partnerPackage: string | null;
  campaigns: { id: string; name?: string; status?: string; error?: string }[];
}

function parseEntries(raw: unknown): Entry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => ({
      email: String((r as Entry)?.email ?? "").trim().toLowerCase(),
      name: String((r as Entry)?.name ?? "").trim() || undefined,
      // Accepts a single id or a comma-separated list — parseCampaignIds
      // already handles both, and a partner may run more than one campaign.
      campaignIds: String((r as Entry)?.campaignIds ?? "").trim(),
    }))
    .filter((e) => e.email);
}

async function plan(entries: Entry[]): Promise<PlannedRow[]> {
  const rows: PlannedRow[] = [];
  for (const entry of entries) {
    const { partnerPackage } = await packageForEmail(entry.email);
    const isPro = (partnerPackage ?? "").trim().toLowerCase() === "pro";

    const ids = parseCampaignIds(entry.campaignIds);
    // Read the campaigns back from Meta so a wrong id is visible as a name
    // that doesn't match the person, or as an error, BEFORE they sign in.
    const campaigns = ids.length && metaTokenSet() ? await getCampaignsInfo(ids) : [];

    if (!isPro) {
      rows.push({
        email: entry.email,
        action: "skip",
        reason: partnerPackage
          ? `on the ${partnerPackage} licence, not Pro`
          : "no Pro licence found in Team Hub",
        partnerPackage,
        campaigns,
      });
      continue;
    }

    const existing = await findByEmail(entry.email);
    rows.push({
      email: entry.email,
      action: existing ? "update" : "create",
      reason: existing
        ? "account exists — will attach campaigns and set the paid tier"
        : "new dormant account, paid tier, campaigns attached",
      partnerPackage,
      campaigns,
    });
  }
  return rows;
}

export async function GET(req: NextRequest) {
  if (!isSuperAdmin(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const raw = req.nextUrl.searchParams.get("entries");
  let entries: Entry[] = [];
  try {
    entries = parseEntries(JSON.parse(raw ?? "[]"));
  } catch {
    return NextResponse.json(
      { error: "`entries` must be JSON: [{email, campaignIds}]" },
      { status: 400 }
    );
  }
  const rows = await plan(entries);
  return NextResponse.json({
    dryRun: true,
    metaConnected: metaTokenSet(),
    counts: {
      create: rows.filter((r) => r.action === "create").length,
      update: rows.filter((r) => r.action === "update").length,
      skip: rows.filter((r) => r.action === "skip").length,
    },
    rows,
  });
}

export async function POST(req: NextRequest) {
  if (!isSuperAdmin(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  if (req.nextUrl.searchParams.get("confirm") !== "yes") {
    return NextResponse.json(
      { error: "Add ?confirm=yes to actually provision. Use GET for a dry run first." },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => null);
  const entries = parseEntries((body as { entries?: unknown })?.entries);
  if (!entries.length) {
    return NextResponse.json({ error: "No entries supplied." }, { status: 400 });
  }

  const rows = await plan(entries);
  const launchHash = hashPassword(LAUNCH_PASSWORD);
  const created: string[] = [];
  const updated: string[] = [];

  for (const row of rows) {
    if (row.action === "skip") continue;
    const entry = entries.find((e) => e.email === row.email);
    if (!entry) continue;

    if (row.action === "update") {
      const existing = await findByEmail(row.email);
      if (!existing) continue;
      // Deliberately does NOT touch the password: this account may already be
      // in use, and resetting someone's password to a shared launch value
      // would be both a lockout and a security problem.
      await updateUser(existing.id, {
        accountType: "paid",
        metaCampaignId: entry.campaignIds || existing.metaCampaignId || null,
      });
      updated.push(row.email);
      continue;
    }

    const user: StoredUser = {
      id: uid(),
      name: entry.name ?? "",
      email: row.email,
      mobile: "",
      photo: null,
      brandId: BRAND_ID,
      platforms: [],
      goal: "",
      packageId: "starter",
      // Their Pro licence covers this — no Stripe subscription exists, and
      // `paid` stays false because it means "Stripe says they've paid".
      // Access is gated on accountType, so this is the honest combination.
      paid: false,
      accountType: "paid",
      mustResetPassword: true,
      createdAt: new Date().toISOString(),
      passwordHash: launchHash,
      metaCampaignId: entry.campaignIds || null,
      location: null,
      onboardingStage: "signed_up",
      adminNotes: [
        {
          at: new Date().toISOString(),
          text: "Pre-provisioned for the TLE V1 launch — Pro licence, campaigns attached.",
        },
      ],
    };
    await createUser(user);
    created.push(row.email);
  }

  return NextResponse.json({
    created: created.length,
    updated: updated.length,
    skipped: rows.filter((r) => r.action === "skip").length,
    note: "No emails sent. Use /api/admin/send-invites when you're ready to launch.",
    rows,
  });
}
