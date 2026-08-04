// Who has live ads, and what licence are they actually on?
//
// Built after several TLE agents turned up with campaigns in Ads Manager who
// weren't on the Pro roster — some on a Basic licence, some missing from Team
// Hub entirely. Checking that name by name doesn't scale and doesn't tell you
// whether the campaign is even still running.
//
// This walks every ad account the System User can see, lists its campaigns with
// their EFFECTIVE status, and lines each one up against Team Hub.
//
// THE MATCHING IS A BEST GUESS AND IS LABELLED AS ONE. Campaigns and ad
// accounts are named by people, not by a schema, so this matches on names
// appearing in the account or campaign title. That is good enough for a report
// a human reads and acts on; it is NOT good enough to drive entitlement, and
// nothing here writes anything. Entitlement stays with `partner_package`.
//
// Read-only. Super admin only — it spans every brand.

import { NextRequest, NextResponse } from "next/server";
import { isSuperAdmin } from "@/lib/admin-auth";
import {
  listAccessibleAdAccounts,
  campaignsInAccount,
  metaTokenSet,
} from "@/lib/meta";
import { partnersForBrandWithPackage } from "@/lib/team-hub";
import { BRANDS } from "@/lib/brands";

export const dynamic = "force-dynamic";

// Statuses that mean the campaign could actually be spending money. Anything
// else is history, which is the whole point of showing this column — a paused
// campaign for a departed agent is not a problem to solve.
const LIVE_STATUSES = new Set(["ACTIVE"]);

interface Directory {
  name: string;
  first: string;
  last: string;
  brandId: string;
  partnerPackage: string | null;
}

function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Best-guess match of a campaign/account name to a person.
 *
 * Requires BOTH first and last name to appear, so "Dan" alone doesn't claim
 * every campaign with the word Dan in it. Returns null rather than a weak
 * guess — an unmatched row is a useful signal, a wrong match is noise that
 * costs someone an afternoon.
 */
function matchPerson(haystack: string, dir: Directory[]): Directory | null {
  const hay = normalise(haystack);
  if (!hay) return null;
  let best: Directory | null = null;
  for (const p of dir) {
    if (!p.first || !p.last) continue;
    if (hay.includes(p.first) && hay.includes(p.last)) {
      // Prefer the longest full-name match, so "Jo Smith" doesn't win over
      // "Joanne Smithson" in a title containing the latter.
      if (!best || p.first.length + p.last.length > best.first.length + best.last.length) {
        best = p;
      }
    }
  }
  return best;
}

export async function GET(req: NextRequest) {
  if (!isSuperAdmin(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  if (!metaTokenSet()) {
    return NextResponse.json(
      { error: "Meta isn't connected on this server." },
      { status: 503 }
    );
  }

  const onlyLive = req.nextUrl.searchParams.get("live") === "1";

  // The whole group's partners, so a campaign can be matched to whoever it
  // actually belongs to rather than only the brand we expected.
  const dir: Directory[] = [];
  for (const brand of BRANDS) {
    try {
      const partners = await partnersForBrandWithPackage(brand.id);
      for (const p of partners) {
        const parts = normalise(p.name).split(" ").filter(Boolean);
        dir.push({
          name: p.name,
          first: parts[0] ?? "",
          last: parts.length > 1 ? parts[parts.length - 1] : "",
          brandId: brand.id,
          partnerPackage: p.partnerPackage,
        });
      }
    } catch {
      // One brand failing to load must not blank the whole report.
    }
  }

  const accounts = await listAccessibleAdAccounts();
  const rows: Record<string, unknown>[] = [];
  const failed: string[] = [];

  for (const acc of accounts) {
    let campaigns;
    try {
      campaigns = await campaignsInAccount(acc.id);
    } catch {
      failed.push(acc.id);
      continue;
    }
    for (const c of campaigns) {
      const live = LIVE_STATUSES.has(c.status.toUpperCase());
      if (onlyLive && !live) continue;
      // The ad account name is the stronger signal when each partner has their
      // own account; the campaign name is the fallback.
      const person =
        matchPerson(acc.name, dir) ?? matchPerson(c.name, dir) ?? null;
      const tier = (person?.partnerPackage ?? "").trim().toLowerCase();
      rows.push({
        accountId: acc.id,
        accountName: acc.name,
        campaignId: c.id,
        campaignName: c.name,
        status: c.status,
        live,
        matchedName: person?.name ?? null,
        matchedBrand: person?.brandId ?? null,
        partnerPackage: person?.partnerPackage ?? null,
        // What a human should do about this row.
        flag: !person
          ? "no-team-hub-match"
          : tier === "pro"
            ? "ok"
            : tier
              ? "not-pro"
              : "no-package-set",
      });
    }
  }

  // Problems first, and live ones above stopped ones — a paused campaign for
  // someone who left is not worth reading before a live one that's mispriced.
  const order: Record<string, number> = {
    "no-team-hub-match": 0,
    "not-pro": 1,
    "no-package-set": 2,
    ok: 3,
  };
  rows.sort((a, b) => {
    const f = order[String(a.flag)] - order[String(b.flag)];
    if (f !== 0) return f;
    return Number(b.live) - Number(a.live);
  });

  const counts = rows.reduce<Record<string, number>>((m, r) => {
    const k = String(r.flag);
    m[k] = (m[k] ?? 0) + 1;
    return m;
  }, {});

  return NextResponse.json({
    note: "Name matching is a best guess — confirm by eye. Nothing here changes any account.",
    accountsSeen: accounts.length,
    accountsUnreadable: failed.length,
    campaigns: rows.length,
    live: rows.filter((r) => r.live).length,
    counts,
    rows,
  });
}
