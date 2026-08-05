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
//
// ACCESS: super admins, plus the LETTINGS managing director — this is her tab,
// and having her ask someone else to run it defeats the point. It is not open
// to MDs generally: another brand's MD has no business provisioning TLE
// accounts. The blast radius is bounded anyway, since BRAND_ID is fixed to
// lettings and only a Pro-licensed TLE partner can ever be connected.

import { NextRequest, NextResponse } from "next/server";
import { adminScope } from "@/lib/admin-auth";
import {
  findByEmail,
  createUser,
  updateUser,
  type StoredUser,
} from "@/lib/users-store";
import { hashPassword } from "@/lib/auth";
import { packageForEmail, teamHubConfigured } from "@/lib/team-hub";
import { TLE_LAUNCH_LIST } from "@/lib/tle-launch-list";
import { connectMetaRef, parseCampaignIds, metaTokenSet } from "@/lib/meta";
import { licenceIncludesAds, adsException } from "@/lib/ads-entitlement";

export const dynamic = "force-dynamic";

// Same shared launch password the Team Hub import uses. Only ever good for the
// first sign-in: these accounts carry mustResetPassword.
const LAUNCH_PASSWORD = process.env.LAUNCH_PASSWORD || "TEG2026";
const BRAND_ID = "lettings";

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/** Super admins, plus the Lettings MD whose tab this is. */
function mayUseInviteTab(req: NextRequest): boolean {
  const scope = adminScope(req);
  if (!scope) return false;
  if (scope.role === "super") return true;
  return scope.role === "md" && scope.brandId === BRAND_ID;
}

export interface ProRow {
  name: string;
  /** From Team Hub. May be blank — the UI lets it be typed in. */
  email: string;
  partnerPackage: string | null;
  /** Set when they're on the list by exception rather than by licence. */
  exceptionReason?: string | null;
  /** Launch Pad state, so the tab shows what's already done. */
  hasAccount: boolean;
  connected: boolean;
  campaignIds: string[];
  /** True while they still hold the shared launch password. */
  awaitingFirstSignIn: boolean;
}

export async function GET(req: NextRequest) {
  if (!mayUseInviteTab(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  // Driven by the launch list, NOT by a Team Hub brand query. Three of these
  // partners are dual-brand and filed under TPE/PPE, so a lettings query would
  // never return them however their licence was set. See lib/tle-launch-list.ts.
  const rows: ProRow[] = [];

  for (const p of TLE_LAUNCH_LIST) {
    const email = p.email ?? "";
    const existing = email ? await findByEmail(email) : undefined;
    const campaignIds = parseCampaignIds(existing?.metaCampaignId);
    // The Hub's package is shown for information only — it's what Susan and
    // Howard are correcting, and seeing "Hub: Basic" next to someone makes the
    // outstanding data job visible rather than invisible.
    let hubPackage: string | null = null;
    if (email && teamHubConfigured()) {
      try {
        hubPackage = (await packageForEmail(email)).partnerPackage;
      } catch {
        /* the roster must render even if the Hub is unreachable */
      }
    }
    rows.push({
      name: p.name,
      email,
      partnerPackage: hubPackage,
      exceptionReason: p.note ?? adsException(email),
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
  if (!mayUseInviteTab(req)) {
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
  if (!licenceIncludesAds(email, partnerPackage, name)) {
    return NextResponse.json(
      {
        error:
          "That person isn't on the TLE launch list, so they don't get Paid Ads included. Check the list in lib/tle-launch-list.ts.",
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
