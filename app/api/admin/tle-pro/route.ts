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
  findById,
  type StoredUser,
} from "@/lib/users-store";
import { hashPassword } from "@/lib/auth";
import { packageForEmail, teamHubConfigured } from "@/lib/team-hub";
import { TLE_LAUNCH_LIST } from "@/lib/tle-launch-list";
import {
  listLaunchExtras,
  addLaunchExtra,
  removeLaunchExtra,
} from "@/lib/launch-list-extra";
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
  /** Launch Pad user id, so Send All can name exactly who it's inviting
   *  rather than sweeping up everyone pending at the brand. */
  userId: string | null;
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
  /** Added through the admin rather than the hardcoded list — so the UI can
   *  offer to remove them again. */
  addedLater?: boolean;
}

export async function GET(req: NextRequest) {
  if (!mayUseInviteTab(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  // Driven by the launch list, NOT by a Team Hub brand query. Three of these
  // partners are dual-brand and filed under TPE/PPE, so a lettings query would
  // never return them however their licence was set. See lib/tle-launch-list.ts.
  const rows: ProRow[] = [];

  /* The fixed list plus anyone added since (see lib/launch-list-extra.ts).
     Extras carry addedLater so the UI can show where they came from and
     offer to take them off again — a hardcoded entry can't be removed from
     the tab, but one James added should be. */
  const extras = await listLaunchExtras(BRAND_ID);
  const known = new Set(
    TLE_LAUNCH_LIST.flatMap((p) =>
      [p.email, ...(p.altEmails ?? [])].filter(Boolean).map((e) => e!.toLowerCase())
    )
  );
  const roster: { name: string; email: string | null; note?: string; addedLater?: boolean }[] = [
    ...TLE_LAUNCH_LIST.map((p) => ({ name: p.name, email: p.email, note: p.note })),
    // Skip anyone already on the fixed list — re-adding a name shouldn't
    // double them up on the roster.
    ...extras
      .filter((e) => !known.has(e.email))
      .map((e) => ({ name: e.name, email: e.email, addedLater: true })),
  ];

  for (const p of roster) {
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
      userId: existing?.id ?? null,
      name: p.name,
      email,
      partnerPackage: hubPackage,
      exceptionReason: p.note ?? adsException(email),
      addedLater: !!p.addedLater,
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

/* Add someone to the TLE launch roster. Body: { name, email }.
 *
 * BRAND IS FORCED to lettings — this is TLE's tab, and the brand is never
 * read from the request, so a crafted call can't file someone under another
 * business. Adding here only puts them ON the roster; the account itself is
 * still created by Connect, and the invite is still the same magic link the
 * original thirteen got. Nothing about the downstream flow changes.
 */
export async function PUT(req: NextRequest) {
  if (!mayUseInviteTab(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  const email = String(body?.email ?? "").trim().toLowerCase();
  if (!name || !email) {
    return NextResponse.json({ error: "Name and email are both needed." }, { status: 400 });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "That email doesn't look right." }, { status: 400 });
  }
  const entry = await addLaunchExtra({
    name,
    email,
    brandId: BRAND_ID,
    addedBy: null,
  });
  return NextResponse.json({ ok: true, entry });
}

/* Detach an agent's Meta campaigns. Body: { userId }.
 *
 * Exists because a wrong attachment is worse than none: leads route STRICTLY
 * by campaign, so ads connected to the wrong person quietly deliver their
 * neighbour's leads (overlapping areas — James, launch day). Reversible:
 * reconnecting is the same Connect flow, so this destroys nothing but the
 * link. The note keeps the who-had-what history on the account.
 */
export async function DELETE(req: NextRequest) {
  if (!mayUseInviteTab(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  /* Two jobs on one verb: { rosterEmail } takes an admin-added person back
     OFF the roster (their account, if Connect made one, is untouched);
     { userId } detaches campaigns as before. */
  const rosterEmail = String(body?.rosterEmail ?? "").trim();
  if (rosterEmail) {
    const removed = await removeLaunchExtra(rosterEmail);
    return NextResponse.json({ ok: removed });
  }
  const userId = String(body?.userId ?? "").trim();
  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }
  const user = await findById(userId);
  if (!user) {
    return NextResponse.json({ error: "No such account." }, { status: 404 });
  }
  const had = parseCampaignIds(user.metaCampaignId);
  await updateUser(userId, {
    metaCampaignId: null,
    adminNotes: [
      ...(user.adminNotes ?? []),
      {
        at: new Date().toISOString(),
        text: `Ads disconnected (was: ${had.join(", ") || "none"}).`,
      },
    ],
  });
  return NextResponse.json({ ok: true, removed: had });
}
