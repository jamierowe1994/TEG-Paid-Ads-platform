import { NextRequest, NextResponse } from "next/server";
import {
  getLeadgenForms,
  getFormLeads,
  getPageAccessToken,
  parseCampaignIds,
  resolveCampaignIds,
  metaTokenSet,
} from "@/lib/meta";
import { listUsers } from "@/lib/users-store";
import { listLeadsForUser } from "@/lib/leads-store";
import { lastSyncRun } from "@/lib/lead-sync";

export const dynamic = "force-dynamic";

/* Lead-flow check for ONE agent: is "she's only had one lead this week"
 * the truth, or a wiring problem?
 *
 * Compares three numbers that should agree:
 *   metaLast7   — leads Meta says her tagged campaigns produced (the truth)
 *   portalLast7 — leads the portal holds for her from the last 7 days
 *   unroutedLast7 — leads seen on the brand's Page whose campaign NOBODY
 *                   has tagged (the classic gap: her ads run under a second
 *                   campaign that never got attached)
 *
 * metaLast7 == portalLast7 -> the pipe is healthy and the number is real.
 * metaLast7 >  portalLast7 -> sync problem (report says where).
 * unroutedLast7 > 0        -> someone's leads are arriving unclaimed; the
 *                             per-campaign breakdown names the campaign ids
 *                             so they can be tagged onto the right person.
 *
 * GET /api/admin/lead-flow?email=<agent email>   (admin bearer)
 * READ-ONLY: imports nothing, alerts nobody, changes nothing.
 */

const WINDOW_MS = 7 * 24 * 3600 * 1000;

function authorised(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const password = process.env.ADMIN_PASSWORD ?? "experts-admin";
  return auth === `Bearer ${password}`;
}

export async function GET(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const email = (req.nextUrl.searchParams.get("email") ?? "").trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }

  const user = (await listUsers()).find(
    (u) => u.email.trim().toLowerCase() === email
  );
  if (!user) {
    return NextResponse.json({ error: "No portal account with that email." }, { status: 404 });
  }

  const tagged = parseCampaignIds(user.metaCampaignId);
  const resolved = tagged.length ? await resolveCampaignIds(tagged) : [];
  const hers = new Set(resolved);

  const body: Record<string, unknown> = {
    agent: { name: user.name, email: user.email, brandId: user.brandId },
    campaignsTagged: tagged,
    campaignsResolved: resolved,
    metaConnected: metaTokenSet(),
  };

  // Portal side: her stored leads from the window.
  const cutoff = Date.now() - WINDOW_MS;
  const stored = await listLeadsForUser(user.id);
  body.portalLast7 = stored.filter(
    (l) => new Date(l.receivedAt).getTime() >= cutoff
  ).length;

  // Meta side: walk the same forms the 5-minute sync walks, but only count.
  if (tagged.length === 0) {
    body.verdict =
      "No campaigns are tagged on this account — the sync has nothing to route to her. Connect her campaigns in the TLE tab.";
    return NextResponse.json(body);
  }
  try {
    const forms = (await getLeadgenForms(user.brandId)) ?? [];
    body.formsOnPage = forms.length;
    if (!forms.length) {
      body.verdict =
        "The brand's Facebook Page has no lead forms visible to the portal — if her ads collect leads on a different Page, the sync never sees them.";
      return NextResponse.json(body);
    }
    const pageToken = (await getPageAccessToken(user.brandId)) ?? undefined;
    let metaLast7 = 0;
    let unroutedLast7 = 0;
    const unroutedByCampaign: Record<string, number> = {};
    // Everyone's tags at this brand, to tell "someone else's lead" apart
    // from "nobody's lead".
    const allTags = new Set<string>();
    for (const a of await listUsers()) {
      if (a.brandId !== user.brandId) continue;
      for (const c of await resolveCampaignIds(parseCampaignIds(a.metaCampaignId)))
        allTags.add(c);
    }
    for (const form of forms) {
      const leads = await getFormLeads(form.id, 200, pageToken);
      for (const ml of leads) {
        if (new Date(ml.createdTime).getTime() < cutoff) continue;
        if (ml.campaignId && hers.has(ml.campaignId)) metaLast7++;
        else if (!ml.campaignId || !allTags.has(ml.campaignId)) {
          unroutedLast7++;
          const key = ml.campaignId ?? "(no campaign id)";
          unroutedByCampaign[key] = (unroutedByCampaign[key] ?? 0) + 1;
        }
      }
    }
    body.metaLast7 = metaLast7;
    body.unroutedLast7 = unroutedLast7;
    if (unroutedLast7 > 0) body.unroutedByCampaign = unroutedByCampaign;

    const portal = body.portalLast7 as number;
    body.verdict =
      metaLast7 === portal
        ? unroutedLast7 > 0
          ? `Her pipe agrees with Meta (${metaLast7} in 7 days) — the number is real. BUT ${unroutedLast7} lead(s) on the Page belong to campaigns nobody has tagged; check unroutedByCampaign in case any are hers.`
          : `Healthy: Meta and the portal both say ${metaLast7} lead(s) in the last 7 days. The number is real — that's what her campaigns produced.`
        : metaLast7 > portal
          ? `GAP: Meta says her campaigns produced ${metaLast7} lead(s) in 7 days but the portal holds ${portal}. The sync is missing some — check the sync run below for errors.`
          : `The portal holds ${portal} but only ${metaLast7} match her tagged campaigns on Meta — some of her stored leads came from elsewhere (manual entry or retagged campaigns). Not a fault.`;
  } catch (e) {
    body.error = e instanceof Error ? e.message : "Meta unreachable";
  }

  const run = lastSyncRun();
  body.lastSync = run
    ? {
        at: run.at,
        brand: run.results.find((r) => r.brandId === user.brandId) ?? null,
      }
    : null;

  return NextResponse.json(body);
}
