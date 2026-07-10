import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth";
import {
  getLead,
  listLeadsForUser,
  setLeadCrmMatch,
} from "@/lib/leads-store";
import { findById } from "@/lib/users-store";
import { rexFindContact, rexConfigured } from "@/lib/rex";
import { atlasFindPerson, atlasConfigured } from "@/lib/atlas";
import type { CrmMatch, Lead } from "@/lib/types";

// Duplicate check against the brand's CRM — "are they already on the
// system?". Property + Lettings share one Rex account, Fine & Country and
// Auction have their own (all via REX_ACCOUNT_<BRAND>), Recruitment is Atlas.
// Body: { leadId } for one lead, or { all: true } to sweep every lead that
// hasn't been checked yet ({ all: true, recheck: true } re-checks the lot).

const REX_BRANDS = new Set(["property", "lettings", "fineandcountry", "auction"]);

async function checkOne(
  brandId: string,
  lead: Lead
): Promise<CrmMatch | null> {
  // No email AND no phone = nothing to look up — record nothing rather than
  // a misleading "checked, not on there".
  if (!(lead.email ?? "").trim() && !(lead.phone ?? "").trim()) return null;
  const checkedAt = new Date().toISOString();
  if (REX_BRANDS.has(brandId)) {
    // rexFindContact THROWS on an API failure (caught by our callers) — only
    // a genuine miss reads as found:false.
    const hit = await rexFindContact(brandId, lead.email ?? "", lead.phone ?? "");
    return hit
      ? { system: "rex", checkedAt, found: true, id: hit.id, matchedBy: hit.matchedBy }
      : { system: "rex", checkedAt, found: false };
  }
  if (brandId === "recruitment") {
    const hit = await atlasFindPerson(lead.email ?? "", lead.phone ?? "");
    if (hit === null) return null; // Atlas couldn't be checked — record nothing
    return hit
      ? { system: "atlas", checkedAt, found: true, id: hit.id, matchedBy: hit.matchedBy }
      : { system: "atlas", checkedAt, found: false };
  }
  return null;
}

export async function POST(req: NextRequest) {
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const user = await findById(userId);
  if (!user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const isRex = REX_BRANDS.has(user.brandId);
  if (isRex && !rexConfigured()) {
    return NextResponse.json(
      { error: "REX isn't connected yet." },
      { status: 503 }
    );
  }
  if (user.brandId === "recruitment" && !atlasConfigured()) {
    return NextResponse.json(
      { error: "Atlas isn't connected yet." },
      { status: 503 }
    );
  }
  if (!isRex && user.brandId !== "recruitment") {
    return NextResponse.json(
      { error: "No CRM is wired up for this business yet." },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => ({}));

  // Single lead
  if (body?.leadId) {
    const lead = await getLead(userId, String(body.leadId));
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    try {
      const match = await checkOne(user.brandId, lead);
      if (!match) {
        return NextResponse.json({
          ok: true,
          checked: 0,
          note: "Couldn't run the check — duplicates are still caught when you push.",
          lead,
        });
      }
      const updated = await setLeadCrmMatch(userId, lead.id, match);
      return NextResponse.json({ ok: true, checked: 1, lead: updated ?? lead });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "CRM check failed" },
        { status: 502 }
      );
    }
  }

  // Sweep: every lead without a stored check (or everything with recheck).
  if (body?.all) {
    const leads = await listLeadsForUser(userId);
    const targets = leads.filter(
      (l) =>
        (body.recheck || !l.crmMatch) &&
        ((l.email ?? "").trim() || (l.phone ?? "").trim())
    );
    let checked = 0;
    let found = 0;
    let unavailable = false;
    // CRM lookups run in small parallel batches (kind to rate limits), but
    // the WRITES are serial — the local-JSON backend is a whole-file
    // read-modify-write, so concurrent saves would drop each other.
    const BATCH = 4;
    for (let i = 0; i < targets.length; i += BATCH) {
      const results = await Promise.all(
        targets.slice(i, i + BATCH).map(async (l) => {
          try {
            return { lead: l, match: await checkOne(user.brandId, l) };
          } catch {
            unavailable = true; // API failure ≠ "not on there" — skip, no stamp
            return null;
          }
        })
      );
      for (const r of results) {
        if (!r) continue;
        if (!r.match) {
          unavailable = true;
          continue;
        }
        await setLeadCrmMatch(userId, r.lead.id, r.match);
        checked++;
        if (r.match.found) found++;
      }
    }
    return NextResponse.json({
      ok: true,
      checked,
      found,
      skipped: targets.length - checked,
      unavailable,
      leads: await listLeadsForUser(userId),
    });
  }

  return NextResponse.json({ error: "leadId or all required" }, { status: 400 });
}
