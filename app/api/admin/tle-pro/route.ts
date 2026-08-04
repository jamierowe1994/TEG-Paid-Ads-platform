// The TLE Pro roster behind the admin Invite tab.
//
// GET  → the Pro-licence partners from Team Hub, each with whatever Launch Pad
//        already knows about them (account made? campaigns attached? still
//        needs to set a password?).
// POST → connect ONE partner: verify what was pasted against Meta, then create
//        or update their dormant account with those campaigns attached.
//
// NO EMAIL IS EVER SENT FROM HERE. Inviting stays a separate, deliberate step,
// so the whole roster can be prepared and checked days before launch without
// anyone being told anything.
//
// Pro status is re-read from Team Hub on every connect. The roster shown in the
// UI decides who we OFFER to connect; it never decides who is entitled. A stale
// page or an edited request must not be able to hand out free Paid Ads.

import { NextRequest, NextResponse } from "next/server";
import { isSuperAdmin } from "@/lib/admin-auth";
import {
  findByEmail,
  createUser,
  updateUser,
  type StoredUser,
} from "@/lib/users-store";
import { hashPassword } from "@/lib/auth";
import { partnersForBrandWithPackage, teamHubConfigured } from "@/lib/team-hub";
import { packageForEmail } from "@/lib/team-hub";
import { connectMetaRef, parseCampaignIds, metaTokenSet } from "@/lib/meta";

export const dynamic = "force-dynamic";

// Same shared launch password the Team Hub import uses. Only ever good for the
// first sign-in: these accounts carry mustResetPassword.
const LAUNCH_PASSWORD = process.env.LAUNCH_PASSWORD || "TEG2026";
const BRAND_ID = "lettings";

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export interface ProRow {
  name: string;
  /** From Team Hub. May be blank — the UI lets it be typed in. */
  email: string;
  partnerPackage: string | null;
  /** Launch Pad state, so the tab shows what's already done. */
  hasAccount: boolean;
  connected: boolean;
  campaignIds: string[];
  /** True while they still hold the shared launch password. */
  awaitingFirstSignIn: boolean;
}

export async function GET(req: NextRequest) {
  if (!isSuperAdmin(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  if (!teamHubConfigured()) {
    return NextResponse.json(
      { error: "Team Hub isn't configured on this server." },
      { status: 503 }
    );
  }

  const partners = await partnersForBrandWithPackage(BRAND_ID);
  const rows: ProRow[] = [];

  for (const p of partners) {
    if ((p.partnerPackage ?? "").trim().toLowerCase() !== "pro") continue;
    const { email, partnerPackage } = p;
    // A Pro partner with no address in the Hub is still LISTED — their email
    // is typed in on the tab. Dropping them would hide someone who's entitled.
    const existing = email ? await findByEmail(email) : undefined;
    const campaignIds = parseCampaignIds(existing?.metaCampaignId);
    rows.push({
      name: p.name,
      email,
      partnerPackage,
      hasAccount: !!existing,
      connected: campaignIds.length > 0,
      campaignIds,
      awaitingFirstSignIn: !!existing?.mustResetPassword,
    });
  }

  rows.sort((a, b) => a.name.localeCompare(b.name));
  return NextResponse.json({
    metaConnected: metaTokenSet(),
    total: rows.length,
    connected: rows.filter((r) => r.connected).length,
    rows,
  });
}

export async function POST(req: NextRequest) {
  if (!isSuperAdmin(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const email = String((body as { email?: string })?.email ?? "")
    .trim()
    .toLowerCase();
  const name = String((body as { name?: string })?.name ?? "").trim();
  const metaRef = String((body as { metaRef?: string })?.metaRef ?? "").trim();

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }

  // Entitlement is re-read from Team Hub, never taken from the request.
  const { partnerPackage } = await packageForEmail(email);
  if ((partnerPackage ?? "").trim().toLowerCase() !== "pro") {
    return NextResponse.json(
      {
        error: partnerPackage
          ? `That address is on the ${partnerPackage} licence, not Pro.`
          : "No Pro licence found in Team Hub for that address.",
      },
      { status: 403 }
    );
  }

  // Verify against Meta BEFORE touching the account, so a bad reference never
  // half-provisions someone.
  const connection = await connectMetaRef(metaRef);
  if (connection.error || !connection.campaigns.length) {
    return NextResponse.json(
      {
        error:
          connection.error ??
          "Couldn't find any campaigns for that reference.",
        connection,
      },
      { status: 400 }
    );
  }

  const campaignIds = connection.campaigns.map((c) => c.id).join(",");
  const existing = await findByEmail(email);

  if (existing) {
    // Never resets the password: this account may already be in use, and
    // forcing the shared launch password would be both a lockout and a
    // security problem.
    await updateUser(existing.id, {
      accountType: "paid",
      metaCampaignId: campaignIds,
    });
  } else {
    const user: StoredUser = {
      id: uid(),
      name,
      email,
      mobile: "",
      photo: null,
      brandId: BRAND_ID,
      platforms: [],
      goal: "",
      packageId: "starter",
      // `paid` means "Stripe says they've paid", which they haven't — their Pro
      // licence covers it. Access is gated on accountType, so this is honest.
      paid: false,
      accountType: "paid",
      mustResetPassword: true,
      createdAt: new Date().toISOString(),
      passwordHash: hashPassword(LAUNCH_PASSWORD),
      metaCampaignId: campaignIds,
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
  }

  return NextResponse.json({
    ok: true,
    created: !existing,
    connection,
    campaignIds: connection.campaigns.map((c) => c.id),
  });
}
