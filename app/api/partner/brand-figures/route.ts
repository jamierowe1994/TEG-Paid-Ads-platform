import { NextRequest, NextResponse } from "next/server";
import { listUsers } from "@/lib/users-store";
import { listAllLeads, summariseLeadsByUser } from "@/lib/leads-store";
import { getCampaignSnapshot, metaTokenSet, parseCampaignIds } from "@/lib/meta";
import { adSpendCapFor } from "@/lib/packages";
import { brandById } from "@/lib/brands";

/**
 * Partner API - one brand's paid-leads figures for a calendar month, as the
 * MD admin screen works them out.
 *
 *   GET /api/partner/brand-figures?brand=lettings&month=2026-11
 *   Authorization: Bearer <PARTNER_API_KEY>
 *   → { brand, month, from, to, totals, agents[], sources[], attention[] }
 *
 * ── Why this exists ──────────────────────────────────────────────────────
 *
 * Susan Liles, 3 Nov 2026: the Paid Leads tab in TLE OS "doesn't show the
 * same details as the paid leads admin site". It didn't: TLE OS counted Meta's
 * leads for the whole ad account and asked a Go High Level token that had
 * stopped working, while this app's MD screen counts the leads that actually
 * landed in each agent's funnel. Two counts of two different things.
 *
 * So TLE OS now asks here, and this route uses the SAME functions the MD
 * screen does - summariseLeadsByUser for leads, conversions and speed to lead,
 * the activity rule for "needs attention", getCampaignSnapshot per agent for
 * spend - rather than TLE OS keeping its own copy of the sums.
 *
 * ── The window is a calendar month, London time ──────────────────────────
 *
 * TLE OS reports by month. `from` is midnight on the 1st in London, `to` is
 * now (this month) or the end of the month (a past one), so the leads here are
 * what the MD screen shows with Custom set to the same dates. Meta spend uses
 * Meta's own "this_month" / "last_month" windows; for anything older Meta has
 * no preset, so spend comes back null rather than a different window's figure.
 *
 * READ ONLY. Nothing here writes.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DAY = 86_400_000;
const CACHE_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; body: unknown }>();
const CONVERTED = new Set(["converted", "pushed"]);

function authorised(req: NextRequest): boolean {
  const key = process.env.PARTNER_API_KEY;
  if (!key) return false;
  const header = req.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (bearer.length !== key.length) return false;
  let diff = 0;
  for (let i = 0; i < key.length; i++) diff |= bearer.charCodeAt(i) ^ key.charCodeAt(i);
  return diff === 0;
}

/** "YYYY-MM" of a moment, on the London calendar. */
function londonMonth(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
  })
    .format(at)
    .slice(0, 7);
}

/** The instant London's clocks read 00:00 on the 1st of "YYYY-MM". */
function londonMonthStart(month: string): Date {
  const [y, m] = month.split("-").map(Number);
  const utcMidnight = Date.UTC(y, m - 1, 1);
  // London is UTC or UTC+1. What does London read at UTC midnight?
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(new Date(utcMidnight))
  );
  return new Date(utcMidnight - hour * 3_600_000);
}

function nextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

function per(spend: number, n: number): number | null {
  return n > 0 && spend > 0 ? Math.round((spend / n) * 100) / 100 : null;
}

export async function GET(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const brandId = (req.nextUrl.searchParams.get("brand") ?? "lettings").trim();
  const brand = brandById(brandId);
  if (!brand) {
    return NextResponse.json({ error: "Unknown brand" }, { status: 400 });
  }

  const now = new Date();
  const thisMonth = londonMonth(now);
  const asked = req.nextUrl.searchParams.get("month") ?? "";
  const month = /^\d{4}-\d{2}$/.test(asked) && asked <= thisMonth ? asked : thisMonth;
  const lastMonth = londonMonth(new Date(londonMonthStart(thisMonth).getTime() - DAY));

  const key = `${brandId}:${month}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS && !req.nextUrl.searchParams.has("fresh")) {
    return NextResponse.json(hit.body);
  }

  const from = londonMonthStart(month);
  const monthEnd = new Date(londonMonthStart(nextMonth(month)).getTime() - 1);
  const to = month === thisMonth ? now : monthEnd;
  const metaWindow =
    month === thisMonth ? "this_month" : month === lastMonth ? "last_month" : null;

  try {
    const [allUsers, summaries, allLeads] = await Promise.all([
      listUsers(),
      summariseLeadsByUser({ from, to }),
      listAllLeads(),
    ]);
    // The MD screen's team is every account in the brand.
    const users = allUsers.filter((u) => u.brandId === brandId);
    const byUser = new Map(summaries.map((s) => [s.userId, s]));
    const userMap = new Map(users.map((u) => [u.id, u]));
    const brandLeads = allLeads.filter((l) => userMap.has(l.userId));
    const inRange = brandLeads.filter((l) => {
      const t = new Date(l.receivedAt).getTime();
      return t >= from.getTime() && t <= to.getTime();
    });

    // Meta spend per agent, as the Ads tab does it: deactivated accounts
    // skipped, serial so twenty agents don't meet Meta's rate limiter.
    const metaOn = metaTokenSet();
    const spendBy = new Map<string, { spend: number; metaLeads: number } | { error: string }>();
    if (metaOn && metaWindow) {
      for (const u of users) {
        if (u.deactivatedAt) continue;
        const ids = parseCampaignIds(u.metaCampaignId);
        if (ids.length === 0) continue;
        try {
          const snap = await getCampaignSnapshot(brandId, ids, metaWindow);
          if (snap) spendBy.set(u.id, { spend: snap.spend, metaLeads: snap.leads });
        } catch (e) {
          spendBy.set(u.id, { error: e instanceof Error ? e.message : "Meta didn't answer" });
        }
      }
    }

    let leads = 0;
    let converted = 0;
    let budget = 0;
    let speedSum = 0;
    let speedN = 0;
    let spend = 0;
    let metaLeads = 0;
    const agents = users.map((u) => {
      const s = byUser.get(u.id);
      const n = s?.total ?? 0;
      const c = s?.converted ?? 0;
      leads += n;
      converted += c;
      budget += adSpendCapFor(u.brandId, u.packageId);
      if (s?.speedMs != null && s.speedSamples > 0) {
        speedSum += s.speedMs * s.speedSamples;
        speedN += s.speedSamples;
      }
      const m = spendBy.get(u.id);
      const ok = m && !("error" in m) ? m : null;
      if (ok) {
        spend += ok.spend;
        metaLeads += ok.metaLeads;
      }
      const connected = parseCampaignIds(u.metaCampaignId).length > 0;
      return {
        name: u.name,
        started: !u.mustResetPassword,
        active: !u.deactivatedAt,
        connected,
        leads: n,
        converted: c,
        rate: n > 0 ? Math.round((c / n) * 100) : null,
        speedMs: s?.speedMs ?? null,
        spend: ok ? ok.spend : null,
        metaLeads: ok ? ok.metaLeads : null,
        cpl: ok ? per(ok.spend, n || ok.metaLeads) : null,
        error: m && "error" in m ? m.error : undefined,
      };
    });
    agents.sort((a, b) => b.leads - a.leads || (b.spend ?? 0) - (a.spend ?? 0));

    // Where leads came from - free text, so anything unrecognised is grouped.
    const bySource = new Map<string, number>();
    for (const l of inRange) {
      const k = (l.source || "other").toLowerCase();
      bySource.set(k, (bySource.get(k) ?? 0) + 1);
    }

    // Needs attention - the activity route's rule, word for word. It is about
    // now, not the month: a lead going cold today is going cold whenever it came.
    const attention: { kind: "unanswered" | "cold"; leadName: string; agentName: string; ageMs: number }[] = [];
    if (month === thisMonth) {
      for (const lead of brandLeads) {
        const u = userMap.get(lead.userId);
        if (!u) continue;
        const lastAt = lead.history.at(-1)?.at ?? lead.receivedAt;
        if (lead.stage === "new") {
          const age = now.getTime() - new Date(lead.receivedAt).getTime();
          if (age > DAY) attention.push({ kind: "unanswered", leadName: lead.name, agentName: u.name, ageMs: age });
        } else if (["attempt1", "attempt2", "attempt3", "nurture"].includes(lead.stage)) {
          const age = now.getTime() - new Date(lastAt).getTime();
          if (age > 2 * DAY) attention.push({ kind: "cold", leadName: lead.name, agentName: u.name, ageMs: age });
        }
      }
      attention.sort((a, b) => b.ageMs - a.ageMs);
    }

    const body = {
      brand: brandId,
      brandName: brand.name,
      conversionLabel: brand.conversionLabel,
      month,
      from: from.toISOString(),
      to: to.toISOString(),
      metaConnected: metaOn,
      metaWindow,
      generatedAt: now.toISOString(),
      totals: {
        leads,
        converted,
        rate: leads > 0 ? Math.round((converted / leads) * 100) : null,
        team: users.length,
        started: agents.filter((a) => a.started).length,
        speedMs: speedN > 0 ? speedSum / speedN : null,
        monthlyBudget: budget,
        spend: metaWindow && metaOn ? Math.round(spend * 100) / 100 : null,
        metaLeads: metaWindow && metaOn ? metaLeads : null,
        cpl: metaWindow && metaOn ? per(spend, leads) : null,
        costPerConversion: metaWindow && metaOn ? per(spend, converted) : null,
      },
      agents,
      sources: [...bySource.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([source, n]) => ({ source, leads: n })),
      attention: attention.slice(0, 20),
      attentionCount: attention.length,
    };
    cache.set(key, { at: Date.now(), body });
    return NextResponse.json(body);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Couldn't work the figures out" },
      { status: 502 }
    );
  }
}
