import "server-only";
import crypto from "crypto";
import { BRANDS } from "./brands";
import { getBrandMetaMap, type BrandMeta } from "./brand-meta-store";

// Meta Marketing API client, per brand. One shared System User token
// (all brands live in the same Business Manager); each brand supplies its own
// ad account via env var:
//   META_SYSTEM_TOKEN            — the never-expiring System User token
//   META_APP_SECRET             — signs requests (appsecret_proof)
//   META_AD_ACCOUNT_<BRAND>     — that brand's ad account (act_… or the number)
//   META_PAGE_<BRAND>           — that brand's page (for the leads webhook)
// <BRAND> is the brand id uppercased: PROPERTY, LETTINGS, MORTGAGE,
// RECRUITMENT, COMMERCIAL, FINEANDCOUNTRY, AUCTION.
//
// Back-compat: recruitment also reads TRE_AD_ACCOUNT_ID / TRE_PAGE_ID.

const GRAPH = "https://graph.facebook.com/v21.0";

function token(): string {
  return process.env.META_SYSTEM_TOKEN ?? "";
}

export function metaTokenSet(): boolean {
  return !!token();
}

// Raw ad account for a brand: DB config (set in admin) first, then env vars.
// `map` can be passed in to avoid re-reading the DB in a loop.
function rawAccount(
  brandId: string,
  map: Record<string, BrandMeta>
): string | undefined {
  const dbId = map[brandId]?.adAccountId;
  if (dbId) return dbId;
  const envId = process.env[`META_AD_ACCOUNT_${brandId.toUpperCase()}`];
  if (envId) return envId;
  if (brandId === "recruitment") return process.env.TRE_AD_ACCOUNT_ID;
  return undefined;
}

async function accountId(brandId: string): Promise<string | null> {
  const map = await getBrandMetaMap();
  const raw = rawAccount(brandId, map);
  if (!raw) return null;
  return raw.startsWith("act_") ? raw : `act_${raw}`;
}

// A brand's Page (needed for the leadgen-forms API — separate from the ad
// account, and needs its own `leads_retrieval` permission on the System User).
async function pageId(brandId: string): Promise<string | null> {
  const map = await getBrandMetaMap();
  const dbId = map[brandId]?.pageId;
  if (dbId) return dbId;
  const envId = process.env[`META_PAGE_${brandId.toUpperCase()}`];
  if (envId) return envId;
  if (brandId === "recruitment") return process.env.TRE_PAGE_ID ?? null;
  return null;
}

export async function pageConfigured(brandId: string): Promise<boolean> {
  return !!(await pageId(brandId));
}

// Which brands have an ad account wired up (and the token is present).
export async function configuredBrandIds(): Promise<string[]> {
  if (!token()) return [];
  const map = await getBrandMetaMap();
  return BRANDS.map((b) => b.id).filter((id) => !!rawAccount(id, map));
}

// Meta recommends signing server calls with appsecret_proof — it must be
// computed with the SAME token the call uses.
function appSecretProof(tok: string): string | undefined {
  const secret = process.env.META_APP_SECRET;
  if (!secret) return undefined;
  return crypto.createHmac("sha256", secret).update(tok).digest("hex");
}

async function graph(
  path: string,
  params: Record<string, string>,
  tokenOverride?: string
): Promise<Record<string, unknown>> {
  const tok = tokenOverride ?? token();
  const q = new URLSearchParams({ access_token: tok, ...params });
  const proof = appSecretProof(tok);
  if (proof) q.set("appsecret_proof", proof);
  const res = await fetch(`${GRAPH}/${path}?${q.toString()}`, {
    cache: "no-store",
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const err = data?.error as { message?: string } | undefined;
    throw new Error(err?.message ?? `Meta API error ${res.status}`);
  }
  return data;
}

export interface Snapshot {
  brandId: string;
  account: { name: string; status: number; currency: string };
  impressions: number;
  clicks: number;
  spend: number;
  ctr: number;
  cpc: number;
  leads: number;
  costPerLead: number | null;
  datePreset: string;
  // Every lead-ish action Meta returned, so the admin can see exactly which
  // metric we count and reconcile it against Ads Manager. Temporary aid while
  // we lock the right figure in.
  leadBreakdown: { type: string; value: number }[];
}

// Meta reports several OVERLAPPING lead action types for the same leads
// (e.g. `lead`, `onsite_conversion.lead_grouped`, `leadgen.other`,
// `offsite_conversion.fb_pixel_lead`). Summing them multi-counts every lead —
// which is why the total came out ~5–6× too high. Count the single canonical
// `lead` action (what Ads Manager's Leads column shows), falling back through
// the grouped on-Meta lead-form action and then pixel leads.
const LEAD_ACTION_PRIORITY = [
  "lead",
  "onsite_conversion.lead_grouped",
  "leadgen.other",
  "offsite_conversion.fb_pixel_lead",
];

function countLeads(
  actions: Array<{ action_type: string; value: string }>
): number {
  for (const type of LEAD_ACTION_PRIORITY) {
    const hit = actions.find((a) => a.action_type === type);
    if (hit) return Number(hit.value ?? 0);
  }
  return 0;
}

// Live stats for one brand's ad account. Returns null if not configured.
export async function getSnapshotFor(
  brandId: string,
  datePreset = "last_30d"
): Promise<Snapshot | null> {
  const acc = await accountId(brandId);
  if (!acc) return null;

  const account = (await graph(acc, {
    fields: "name,account_status,currency",
  })) as { name: string; account_status: number; currency: string };

  const insights = (await graph(`${acc}/insights`, {
    fields: "impressions,clicks,spend,cpc,ctr,actions",
    ...presetParams(datePreset),
  })) as { data?: Array<Record<string, unknown>> };

  const row = insights.data?.[0] ?? {};
  const actions =
    (row.actions as Array<{ action_type: string; value: string }>) ?? [];
  const leads = countLeads(actions);
  const leadBreakdown = actions
    .filter((a) => /lead/i.test(a.action_type))
    .map((a) => ({ type: a.action_type, value: Number(a.value ?? 0) }))
    .sort((a, b) => b.value - a.value);
  const spend = Number(row.spend ?? 0);

  return {
    brandId,
    account: {
      name: account.name,
      status: account.account_status,
      currency: account.currency,
    },
    impressions: Number(row.impressions ?? 0),
    clicks: Number(row.clicks ?? 0),
    spend,
    ctr: Number(row.ctr ?? 0),
    cpc: Number(row.cpc ?? 0),
    leads,
    costPerLead: leads > 0 ? spend / leads : null,
    datePreset,
    leadBreakdown,
  };
}

// Split a comma-separated campaign-ids string (how it's stored on the agent
// profile — agents can run several campaigns at once) into clean ids.
export function parseCampaignIds(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Verify campaign ids against Meta — returns each one's real name + status so
// the admin can SEE the link is right when they hit Save (a bad id comes back
// as its error message instead). `brandId` is accepted for back-compat but no
// longer needed: stats follow each campaign to its own ad account now.
export async function getCampaignsInfo(
  ids: string[],
  _brandId?: string
): Promise<Array<{ id: string; name?: string; status?: string; error?: string }>> {
  return Promise.all(
    ids.map(async (id) => {
      try {
        // If an ad set / ad id was pasted, show its PARENT CAMPAIGN's name —
        // that's what the stats actually follow.
        const { campaignId } = await resolveTaggedId(id);
        const c = (await graph(campaignId, {
          fields: "name,effective_status",
        })) as {
          name?: string;
          effective_status?: string;
        };
        return { id, name: c.name, status: c.effective_status };
      } catch (e) {
        return { id, error: e instanceof Error ? e.message : "Meta error" };
      }
    })
  );
}

function normaliseAct(raw: string | undefined): string | null {
  if (!raw) return null;
  return raw.startsWith("act_") ? raw : `act_${raw}`;
}

// People paste whatever ID Ads Manager happens to show — which, depending on
// the tab, is an AD SET or AD id rather than the campaign's. Those read back
// fine by id (name + ACTIVE status), so the tag verifies green, but filtering
// ads/insights by campaign.id then matches nothing and the dashboard shows
// silent zeros. Resolve every tagged id to its real parent campaign, plus the
// ad account it lives in (which also isn't necessarily the brand's configured
// one).
const idResolveCache = new Map<
  string,
  { campaignId: string; account: string | null }
>();

async function resolveTaggedId(
  id: string
): Promise<{ campaignId: string; account: string | null }> {
  const cached = idResolveCache.get(id);
  if (cached) return cached;
  let campaignId = id;
  let account: string | null = null;
  try {
    // campaign_id only exists on ad sets and ads — asking a campaign for it
    // errors, which is exactly how we tell them apart…
    const o = (await graph(id, { fields: "account_id,campaign_id" })) as {
      account_id?: string;
      campaign_id?: string;
    };
    if (o.campaign_id) campaignId = o.campaign_id;
    account = normaliseAct(o.account_id);
  } catch {
    try {
      // …so fall back to reading it as the campaign it (hopefully) is.
      const c = (await graph(id, { fields: "account_id" })) as {
        account_id?: string;
      };
      account = normaliseAct(c.account_id);
    } catch {
      /* unreadable id — account stays null, brand fallback below */
    }
  }
  const resolved = { campaignId, account };
  idResolveCache.set(id, resolved);
  return resolved;
}

// Group the (resolved) campaign ids by the ad account each one lives in, so
// every query below asks the right account. Unresolvable ids fall back to the
// brand's configured account.
async function groupCampaignsByAccount(
  brandId: string,
  campaignIds: string[]
): Promise<Map<string, string[]>> {
  const fallback = await accountId(brandId);
  const groups = new Map<string, string[]>();
  await Promise.all(
    campaignIds.map(async (id) => {
      const { campaignId, account } = await resolveTaggedId(id);
      const key = account ?? fallback;
      if (!key) return;
      const list = groups.get(key) ?? [];
      if (!list.includes(campaignId)) groups.set(key, [...list, campaignId]);
    })
  );
  return groups;
}

export interface CampaignSnapshot {
  impressions: number;
  clicks: number;
  spend: number;
  leads: number;
  datePreset: string;
}

// Per-AGENT stats: insights for just their campaign(s), each queried in the
// ad account it actually lives in — this feeds the customer's own dashboard
// numbers. One unreachable account doesn't zero out the rest.
export async function getCampaignSnapshot(
  brandId: string,
  campaignIds: string[],
  datePreset = "last_30d"
): Promise<CampaignSnapshot | null> {
  if (campaignIds.length === 0) return null;
  const groups = await groupCampaignsByAccount(brandId, campaignIds);
  if (groups.size === 0) return null;

  let impressions = 0;
  let clicks = 0;
  let spend = 0;
  let leads = 0;
  await Promise.all(
    [...groups.entries()].map(async ([acc, ids]) => {
      try {
        const insights = (await graph(`${acc}/insights`, {
          level: "campaign",
          fields: "impressions,clicks,spend,actions",
          ...presetParams(datePreset),
          filtering: JSON.stringify([
            { field: "campaign.id", operator: "IN", value: ids },
          ]),
          limit: "100",
        })) as { data?: Array<Record<string, unknown>> };
        for (const row of insights.data ?? []) {
          impressions += Number(row.impressions ?? 0);
          clicks += Number(row.clicks ?? 0);
          spend += Number(row.spend ?? 0);
          leads += countLeads(
            (row.actions as Array<{ action_type: string; value: string }>) ??
              []
          );
        }
      } catch {
        /* skip this account's contribution rather than failing the lot */
      }
    })
  );
  return { impressions, clicks, spend, leads, datePreset };
}

/* Statuses that mean the ad never ran, or stopped for a reason the agent
   can't influence. DISAPPROVED and ADSET/CAMPAIGN-level rejections are the
   common ones; PENDING_REVIEW is included because a tile that says "pending
   review" invites a question nobody in the field can answer. */
const HIDDEN_AD_STATUSES = new Set([
  "DISAPPROVED",
  "WITH_ISSUES",
  "PENDING_REVIEW",
  "PENDING_BILLING_INFO",
  "DELETED",
  "ARCHIVED",
]);

/* Deliberately NOT hidden: ADSET_PAUSED and CAMPAIGN_PAUSED. Those ads were
   approved and did run — they're just not delivering at the moment. Hiding
   them would make an agent think their ads had disappeared, which is a worse
   confusion than the one this filter exists to prevent. */

export interface AgentAd {
  id: string;
  name: string;
  status: string;
  imageUrl: string | null;
}

// Every ad inside the agent's tagged campaign(s), with each creative's image
// — feeds the overview's rotating "Current ad" tile and the All Ads gallery.
// Queries each campaign's OWN ad account. Best-effort: returns [] rather than
// throwing; a missing thumbnail just leaves that ad's imageUrl null. Active
// ads first, capped at 12.
//
// ADS META REJECTED ARE HIDDEN. An agent can do nothing about a disapproved
// ad — it's ours to rewrite and resubmit — so showing it is noise at best and
// alarming at worst. Rejections come in batches when a creative trips a policy
// across several ads at once, so a handful of "disapproved" tiles can end up
// outnumbering the live ones and make a working account look broken.
export async function getAdsWithCreatives(
  brandId: string,
  campaignIds: string[]
): Promise<AgentAd[]> {
  try {
    if (campaignIds.length === 0) return [];
    const groups = await groupCampaignsByAccount(brandId, campaignIds);
    if (groups.size === 0) return [];

    const perAccount = await Promise.all(
      [...groups.entries()].map(async ([acc, ids]) => {
        try {
          const ads = (await graph(`${acc}/ads`, {
            fields: "name,effective_status,creative{id}",
            filtering: JSON.stringify([
              { field: "campaign.id", operator: "IN", value: ids },
            ]),
            limit: "25",
          })) as {
            data?: Array<{
              id?: string;
              name?: string;
              effective_status?: string;
              creative?: { id?: string };
            }>;
          };
          return ads.data ?? [];
        } catch {
          return [];
        }
      })
    );

    const list = perAccount
      .flat()
      .filter((a) => a.id)
      // Nothing an agent can action, so nothing an agent should see.
      .filter((a) => !HIDDEN_AD_STATUSES.has(String(a.effective_status ?? "")))
      .sort((a, b) =>
        a.effective_status === "ACTIVE" && b.effective_status !== "ACTIVE"
          ? -1
          : b.effective_status === "ACTIVE" && a.effective_status !== "ACTIVE"
            ? 1
            : 0
      )
      .slice(0, 12);

    return Promise.all(
      list.map(async (ad) => {
        let imageUrl: string | null = null;
        if (ad.creative?.id) {
          try {
            const creative = (await graph(ad.creative.id, {
              fields: "thumbnail_url",
              thumbnail_width: "800",
              thumbnail_height: "800",
            })) as { thumbnail_url?: string };
            imageUrl = creative.thumbnail_url ?? null;
          } catch {
            /* thumbnail is optional */
          }
        }
        return {
          id: String(ad.id),
          name: ad.name ?? "Untitled ad",
          status: ad.effective_status ?? "UNKNOWN",
          imageUrl,
        };
      })
    );
  } catch {
    return [];
  }
}

export interface AdFigures {
  impressions: number;
  clicks: number;
  spend: number;
  leads: number;
  cpl: number | null;
}

// Per-ad figures for the agent's campaigns — keyed by ad id so the gallery
// can pair each thumbnail with its own numbers. Queries each campaign's OWN
// ad account.
export async function getAdInsightsByAd(
  brandId: string,
  campaignIds: string[],
  datePreset = "last_30d"
): Promise<Record<string, AdFigures>> {
  if (campaignIds.length === 0) return {};
  const groups = await groupCampaignsByAccount(brandId, campaignIds);
  if (groups.size === 0) return {};

  const out: Record<string, AdFigures> = {};
  await Promise.all(
    [...groups.entries()].map(async ([acc, ids]) => {
      try {
        const data = (await graph(`${acc}/insights`, {
          level: "ad",
          fields: "ad_id,impressions,clicks,spend,actions",
          ...presetParams(datePreset),
          filtering: JSON.stringify([
            { field: "campaign.id", operator: "IN", value: ids },
          ]),
          limit: "100",
        })) as { data?: Array<Record<string, unknown>> };
        for (const row of data.data ?? []) {
          const id = String(row.ad_id ?? "");
          if (!id) continue;
          const leads = countLeads(
            (row.actions as Array<{ action_type: string; value: string }>) ??
              []
          );
          const spend = Number(row.spend ?? 0);
          out[id] = {
            impressions: Number(row.impressions ?? 0),
            clicks: Number(row.clicks ?? 0),
            spend,
            leads,
            cpl: leads > 0 ? spend / leads : null,
          };
        }
      } catch {
        /* skip this account rather than failing the lot */
      }
    })
  );
  return out;
}

// ── Diagnostics ─────────────────────────────────────────────────────────────
// Every step of the per-agent pipeline, with Meta's RAW answer at each one —
// nothing swallowed. This exists because the normal queries hide errors
// (deliberately: one broken account shouldn't blank the dashboard), which
// makes "the numbers are zero" impossible to debug from the outside.
export interface CampaignDiagnostics {
  brandAccount: string | null;
  campaigns: Array<{
    id: string;
    name?: string;
    status?: string;
    accountId?: string;
    // Set when the tagged id turned out to be an ad set / ad — this is the
    // parent campaign we actually query with.
    resolvedCampaignId?: string;
    error?: string;
  }>;
  accounts: Array<{
    account: string;
    campaignIds: string[];
    accountName?: string;
    accountError?: string;
    adsFound?: number;
    adNames?: string[];
    adsError?: string;
    insightRows?: number;
    impressions?: number;
    spend?: number;
    insightsError?: string;
  }>;
}

export async function diagnoseAgentCampaigns(
  brandId: string,
  campaignIds: string[]
): Promise<CampaignDiagnostics> {
  const brandAccount = await accountId(brandId);

  // Step 1: each tagged id's identity + home account, straight from Meta —
  // including whether the id is really a campaign or actually an ad set / ad
  // (very easy to copy from the wrong Ads Manager tab; it verifies green but
  // matches nothing when used as a campaign filter).
  const campaigns = await Promise.all(
    campaignIds.map(async (id) => {
      const { campaignId, account } = await resolveTaggedId(id);
      try {
        const c = (await graph(campaignId, {
          fields: "name,effective_status,account_id",
        })) as { name?: string; effective_status?: string; account_id?: string };
        return {
          id,
          name: c.name,
          status: c.effective_status,
          accountId: normaliseAct(c.account_id) ?? account ?? undefined,
          resolvedCampaignId: campaignId !== id ? campaignId : undefined,
        };
      } catch (e) {
        return { id, error: e instanceof Error ? e.message : "Meta error" };
      }
    })
  );

  // Step 2: for each account the campaigns resolve to, prove we can actually
  // read it, list its ads, and pull insights — the three calls the dashboard
  // relies on.
  const groups = new Map<string, string[]>();
  for (const c of campaigns) {
    const acc = c.accountId ?? brandAccount;
    if (!acc) continue;
    const realId = c.resolvedCampaignId ?? c.id;
    const list = groups.get(acc) ?? [];
    if (!list.includes(realId)) groups.set(acc, [...list, realId]);
  }

  const accounts = await Promise.all(
    [...groups.entries()].map(async ([account, ids]) => {
      const entry: CampaignDiagnostics["accounts"][number] = {
        account,
        campaignIds: ids,
      };
      try {
        const info = (await graph(account, { fields: "name" })) as {
          name?: string;
        };
        entry.accountName = info.name;
      } catch (e) {
        entry.accountError = e instanceof Error ? e.message : "Meta error";
      }
      try {
        const ads = (await graph(`${account}/ads`, {
          fields: "name,effective_status",
          filtering: JSON.stringify([
            { field: "campaign.id", operator: "IN", value: ids },
          ]),
          limit: "25",
        })) as { data?: Array<{ name?: string }> };
        entry.adsFound = (ads.data ?? []).length;
        entry.adNames = (ads.data ?? [])
          .map((a) => a.name ?? "?")
          .slice(0, 12);
      } catch (e) {
        entry.adsError = e instanceof Error ? e.message : "Meta error";
      }
      try {
        const insights = (await graph(`${account}/insights`, {
          level: "campaign",
          fields: "impressions,clicks,spend",
          date_preset: "last_30d",
          filtering: JSON.stringify([
            { field: "campaign.id", operator: "IN", value: ids },
          ]),
          limit: "100",
        })) as { data?: Array<Record<string, unknown>> };
        const rows = insights.data ?? [];
        entry.insightRows = rows.length;
        entry.impressions = rows.reduce(
          (s, r) => s + Number(r.impressions ?? 0),
          0
        );
        entry.spend = rows.reduce((s, r) => s + Number(r.spend ?? 0), 0);
      } catch (e) {
        entry.insightsError = e instanceof Error ? e.message : "Meta error";
      }
      return entry;
    })
  );

  return { brandAccount, campaigns, accounts };
}

// Date ranges offered in the admin. Meta's presets exclude "today", matching
// Ads Manager's own windows.
export const META_DATE_PRESETS = [
  { id: "last_7d", label: "7 days" },
  { id: "last_14d", label: "14 days" },
  { id: "last_30d", label: "30 days" },
  { id: "last_90d", label: "90 days" },
] as const;

const VALID_PRESETS = new Set(META_DATE_PRESETS.map((p) => p.id));

// The partner API (the portal's "My Ads" view) offers a slightly wider window
// set than the admin dropdown: "this month" (a native Meta preset) and "60
// days" (Meta has no 60-day preset — served as a custom time_range below).
const CUSTOM_RANGE_DAYS: Record<string, number> = { last_60d: 60 };
const PARTNER_PRESETS = new Set<string>([
  ...VALID_PRESETS,
  "this_month",
  ...Object.keys(CUSTOM_RANGE_DAYS),
]);

export function sanitizePreset(p: string | null | undefined): string {
  return p && PARTNER_PRESETS.has(p) ? p : "last_30d";
}

// Insight query params for a preset: either a native Meta `date_preset`, or a
// computed `time_range` for windows Meta has no preset for (e.g. last 60 days).
// Custom ranges end yesterday, matching Meta's own "last N days" windows.
export function presetParams(preset: string): Record<string, string> {
  const days = CUSTOM_RANGE_DAYS[preset];
  if (!days) return { date_preset: preset };
  const DAY = 86_400_000;
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return {
    time_range: JSON.stringify({
      since: iso(Date.now() - days * DAY),
      until: iso(Date.now() - DAY),
    }),
  };
}

export interface AdRow {
  adName: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  cpl: number | null;
}

// Per-ad performance for one brand, best-performing first (most leads, then
// lowest cost-per-lead). Drives the drill-down's "what's working" table.
export async function getBrandAdsFor(
  brandId: string,
  datePreset = "last_30d"
): Promise<AdRow[] | null> {
  const acc = await accountId(brandId);
  if (!acc) return null;
  const data = (await graph(`${acc}/insights`, {
    level: "ad",
    fields: "ad_name,spend,impressions,clicks,actions",
    date_preset: datePreset,
    limit: "500",
  })) as { data?: Array<Record<string, unknown>> };
  const rows: AdRow[] = (data.data ?? []).map((r) => {
    const actions =
      (r.actions as Array<{ action_type: string; value: string }>) ?? [];
    const leads = countLeads(actions);
    const spend = Number(r.spend ?? 0);
    return {
      adName: String(r.ad_name ?? "Unnamed ad"),
      spend,
      impressions: Number(r.impressions ?? 0),
      clicks: Number(r.clicks ?? 0),
      leads,
      cpl: leads > 0 ? spend / leads : null,
    };
  });
  rows.sort(
    (a, b) => b.leads - a.leads || (a.cpl ?? Infinity) - (b.cpl ?? Infinity)
  );
  return rows;
}

// Lightweight connection check for one brand (no ad data — just that the
// token + account work, plus the account name).
export async function pingBrand(brandId: string): Promise<{
  brandId: string;
  configured: boolean;
  ok: boolean;
  account?: string;
  error?: string;
}> {
  const acc = await accountId(brandId);
  if (!token() || !acc) {
    return { brandId, configured: false, ok: false };
  }
  try {
    const info = (await graph(acc, { fields: "name" })) as { name: string };
    return { brandId, configured: true, ok: true, account: info.name };
  } catch (e) {
    return {
      brandId,
      configured: true,
      ok: false,
      error: e instanceof Error ? e.message : "Meta request failed",
    };
  }
}

// Ping every configured brand (used by the health endpoint).
export async function pingAll(): Promise<{
  tokenSet: boolean;
  brands: Array<Awaited<ReturnType<typeof pingBrand>>>;
}> {
  const ids = await configuredBrandIds();
  const brands = await Promise.all(ids.map((id) => pingBrand(id)));
  return { tokenSet: metaTokenSet(), brands };
}

// ── Organic socials snapshot (Page + Instagram followers) ──────────────────
// Separate from ads Insights: reads the brand's Facebook Page follower count +
// its linked Instagram business account, plus "followers gained" over a window.
// Needs the System User to have the Page asset AND the token to carry
// `pages_read_engagement` + `instagram_basic` (+ `instagram_manage_insights`
// for the IG "gained" series). Everything degrades gracefully — a missing Page,
// missing IG link, or missing permission returns nulls, never throws.

export interface SocialPlatform {
  configured: boolean; // the account exists / is linked
  followers: number | null; // current total
  gained: number | null; // net new over the window (null if unavailable)
  handle: string | null;
  error?: string;
}

export interface SocialSnapshot {
  brandId: string;
  datePreset: string;
  facebook: SocialPlatform;
  instagram: SocialPlatform;
}

// Insight windows use since/until dates (not date_preset). Ends yesterday, to
// match how the ads windows behave.
function presetSinceUntil(preset: string): { since: string; until: string } {
  const DAY = 86_400_000;
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const until = iso(Date.now() - DAY);
  if (preset === "this_month") {
    const now = new Date();
    return { since: iso(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), until };
  }
  const days: Record<string, number> = {
    last_7d: 7,
    last_14d: 14,
    last_30d: 30,
    last_60d: 60,
    last_90d: 90,
  };
  return { since: iso(Date.now() - (days[preset] ?? 30) * DAY), until };
}

function sumInsightMetric(
  data: Array<{ name?: string; values?: Array<{ value?: number }> }> | undefined,
  name?: string
): number {
  const row = name ? data?.find((d) => d.name === name) : data?.[0];
  return (row?.values ?? []).reduce((t, v) => t + Number(v.value ?? 0), 0);
}

// Net Page follower growth over a window. Follower-insight metric names differ
// by Graph version, so try the modern "follows" set first, then legacy "fan"
// (page-like) metrics, then a gross-adds-only fallback; each failed set just
// falls through to the next (an invalid metric errors the whole call).
async function fbFollowerGrowth(
  pid: string,
  since: string,
  until: string,
  pageToken?: string
): Promise<number | null> {
  const attempts: Array<[string, string | null]> = [
    ["page_daily_follows_unique", "page_daily_unfollows_unique"],
    ["page_fan_adds_unique", "page_fan_removes_unique"],
    ["page_daily_follows_unique", null],
    ["page_fan_adds_unique", null],
  ];
  for (const [addM, remM] of attempts) {
    try {
      const ins = (await graph(
        `${pid}/insights`,
        { metric: remM ? `${addM},${remM}` : addM, period: "day", since, until },
        pageToken
      )) as { data?: Array<{ name?: string; values?: Array<{ value?: number }> }> };
      if (!ins.data || ins.data.length === 0) continue;
      const adds = sumInsightMetric(ins.data, addM);
      const removes = remM ? sumInsightMetric(ins.data, remM) : 0;
      return adds - removes;
    } catch {
      /* metric set not available in this Graph version — try the next */
    }
  }
  return null;
}

export async function getSocialSnapshot(
  brandId: string,
  datePreset = "last_30d"
): Promise<SocialSnapshot> {
  const blank = (): SocialPlatform => ({
    configured: false,
    followers: null,
    gained: null,
    handle: null,
  });
  const out: SocialSnapshot = {
    brandId,
    datePreset,
    facebook: blank(),
    instagram: blank(),
  };

  const pid = await pageId(brandId);
  if (!token() || !pid) return out; // no Page configured for this brand

  const { since, until } = presetSinceUntil(datePreset);
  let pageToken: string | undefined;
  try {
    pageToken = (await getPageAccessToken(brandId)) ?? undefined;
  } catch {
    /* fall back to the system token — may still work for public fields */
  }

  // ── Facebook Page ──
  out.facebook.configured = true;
  try {
    const page = (await graph(
      pid,
      {
        fields:
          "name,followers_count,fan_count,instagram_business_account{id,username,followers_count}",
      },
      pageToken
    )) as {
      name?: string;
      followers_count?: number;
      fan_count?: number;
      instagram_business_account?: {
        id?: string;
        username?: string;
        followers_count?: number;
      };
    };
    out.facebook.followers = Number(page.followers_count ?? page.fan_count ?? 0);
    out.facebook.handle = page.name ?? null;

    // Net new Page follows over the window (metric names vary by Graph
    // version — the helper tries each in turn, null if none serve).
    out.facebook.gained = await fbFollowerGrowth(pid, since, until, pageToken);

    // ── Instagram (linked business account) ──
    const ig = page.instagram_business_account;
    if (ig?.id) {
      out.instagram.configured = true;
      out.instagram.followers =
        ig.followers_count != null ? Number(ig.followers_count) : null;
      out.instagram.handle = ig.username ? `@${ig.username}` : null;

      // IG "follower_count" insight = new followers per day (capped at ~30 days
      // by Meta, and needs ≥100 followers) — sum = gained over the window.
      try {
        const igIns = (await graph(
          `${ig.id}/insights`,
          { metric: "follower_count", period: "day", since, until },
          pageToken
        )) as { data?: Array<{ values?: Array<{ value?: number }> }> };
        out.instagram.gained = sumInsightMetric(igIns.data);
      } catch {
        out.instagram.gained = null;
      }
    }
  } catch (e) {
    out.facebook.error = e instanceof Error ? e.message : "Meta request failed";
  }

  return out;
}

// Socials for every Page-configured brand (health probe + admin overview).
export async function getAllSocials(): Promise<SocialSnapshot[]> {
  const map = await getBrandMetaMap();
  const ids = BRANDS.map((b) => b.id).filter(
    (id) => !!(map[id]?.pageId || process.env[`META_PAGE_${id.toUpperCase()}`])
  );
  return Promise.all(ids.map((id) => getSocialSnapshot(id)));
}

// ── Instant Form lead retrieval (one-off historic backfill) ────────────────
// Separate from the Insights API above: this reads Meta's own stored lead
// records (name/phone/email) for a brand's Page — only works for native
// "Instant Form" lead ads, and only within Meta's ~90-day retention window.
// Needs the System User to have the Page asset + `leads_retrieval` permission
// (a different grant from the ad account's `ads_read`).

export interface LeadgenForm {
  id: string;
  name: string;
  status: string;
  leadsCount: number;
}

// The leadgen endpoints refuse the business/system-user token outright
// ("(#190) This method must be called with a Page Access Token") — the token
// has to be exchanged for the Page's own token first, which works precisely
// because the system user now has the Page assigned.
const pageTokenCache = new Map<string, string>();

export async function getPageAccessToken(
  brandId: string
): Promise<string | null> {
  const pid = await pageId(brandId);
  if (!pid) return null;
  const cached = pageTokenCache.get(pid);
  if (cached) return cached;
  const page = (await graph(pid, { fields: "access_token" })) as {
    access_token?: string;
  };
  if (!page.access_token) return null;
  pageTokenCache.set(pid, page.access_token);
  return page.access_token;
}

// The forms on a brand's Page, most recently active first. Returns null if
// no Page is configured for the brand.
export async function getLeadgenForms(
  brandId: string
): Promise<LeadgenForm[] | null> {
  const pid = await pageId(brandId);
  if (!pid) return null;
  const pageToken = await getPageAccessToken(brandId);
  const data = (await graph(
    `${pid}/leadgen_forms`,
    {
      fields: "id,name,status,leads_count",
      limit: "200",
    },
    pageToken ?? undefined
  )) as { data?: Array<Record<string, unknown>> };
  return (data.data ?? []).map((f) => ({
    id: String(f.id),
    name: String(f.name ?? "Untitled form"),
    status: String(f.status ?? ""),
    leadsCount: Number(f.leads_count ?? 0),
  }));
}

export interface MetaLead {
  id: string;
  createdTime: string;
  adName: string | null;
  campaignId: string | null; // routes the lead to the agent tagged with it
  platform: string | null; // "fb" | "ig"
  fields: Record<string, string>; // flattened field_data (name -> first value)
}

// The real campaign id behind each tagged id (ad set / ad ids resolve to
// their parent campaign) — lets the lead sync match a lead's campaign_id
// against whatever the admin actually pasted.
export async function resolveCampaignIds(ids: string[]): Promise<string[]> {
  return Promise.all(ids.map(async (id) => (await resolveTaggedId(id)).campaignId));
}

function flattenFieldData(
  fieldData: Array<{ name: string; values?: string[] }> | undefined
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fieldData ?? []) out[f.name] = f.values?.[0] ?? "";
  return out;
}

// Every lead Meta still holds for one form, oldest pagination first, capped
// at maxLeads as a sane ceiling for a one-off backfill. Needs the Page's own
// token (see getPageAccessToken).
export async function getFormLeads(
  formId: string,
  maxLeads = 2000,
  pageToken?: string
): Promise<MetaLead[]> {
  const leads: MetaLead[] = [];
  let after: string | undefined;
  while (leads.length < maxLeads) {
    const params: Record<string, string> = {
      fields: "id,created_time,field_data,ad_name,campaign_id,platform",
      limit: "100",
    };
    if (after) params.after = after;
    const data = (await graph(`${formId}/leads`, params, pageToken)) as {
      data?: Array<Record<string, unknown>>;
      paging?: { cursors?: { after?: string } };
    };
    const rows = data.data ?? [];
    for (const r of rows) {
      leads.push({
        id: String(r.id),
        createdTime: String(r.created_time ?? new Date().toISOString()),
        adName: r.ad_name ? String(r.ad_name) : null,
        campaignId: r.campaign_id ? String(r.campaign_id) : null,
        platform: r.platform ? String(r.platform) : null,
        fields: flattenFieldData(
          r.field_data as Array<{ name: string; values?: string[] }>
        ),
      });
    }
    after = data.paging?.cursors?.after;
    if (!after || rows.length === 0) break;
  }
  return leads.slice(0, maxLeads);
}

// Meta's standard Instant Form question keys -> our lead fields; anything
// else on the form gets folded into a readable note.
export function mapLeadFields(fields: Record<string, string>): {
  name: string;
  phone: string;
  email: string;
  extra: string;
} {
  const name =
    fields.full_name ||
    [fields.first_name, fields.last_name].filter(Boolean).join(" ") ||
    "Unknown";
  const phone = fields.phone_number || fields.phone || "";
  const email = fields.email || "";
  const knownKeys = new Set([
    "full_name",
    "first_name",
    "last_name",
    "phone_number",
    "phone",
    "email",
  ]);
  const extra = Object.keys(fields)
    .filter((k) => !knownKeys.has(k) && fields[k])
    .map((k) => `${k.replace(/_/g, " ")}: ${fields[k]}`)
    .join(" · ");
  return { name, phone, email, extra };
}

// ── Connecting a partner to their existing Meta ads ─────────────────────────

export interface ConnectedCampaign {
  id: string;
  name: string;
  status: string;
}

export interface MetaConnection {
  /** What the pasted reference turned out to be. */
  kind: "account" | "campaign" | "unknown";
  /** The ad account these campaigns live in, `act_`-prefixed. */
  accountId: string | null;
  campaigns: ConnectedCampaign[];
  /** Human-readable reason the reference couldn't be used. */
  error: string | null;
}

/**
 * Resolve whatever someone pasted into the campaigns it refers to.
 *
 * Admins paste whatever Ads Manager happened to be showing — an ad account, a
 * campaign, an ad set, or an ad. All four are accepted, because telling people
 * "wrong kind of id" is a support call we can just avoid.
 *
 * The point of returning campaign NAMES is verification: a wrong id doesn't
 * error, it silently attaches one partner to another partner's spend and
 * leads. Seeing the name next to the person is what catches that.
 */
export async function connectMetaRef(raw: string): Promise<MetaConnection> {
  const ref = raw.trim();
  const empty: MetaConnection = {
    kind: "unknown",
    accountId: null,
    campaigns: [],
    error: null,
  };
  if (!ref) return { ...empty, error: "Nothing entered." };
  if (!metaTokenSet()) {
    return { ...empty, error: "Meta isn't connected on this server." };
  }

  const asAccount = async (act: string): Promise<MetaConnection> => {
    const res = (await graph(`${act}/campaigns`, {
      fields: "id,name,status",
      limit: "200",
    })) as { data?: Array<{ id: string; name?: string; status?: string }> };
    const campaigns = (res.data ?? []).map((c) => ({
      id: String(c.id),
      name: c.name ?? "(unnamed)",
      status: c.status ?? "UNKNOWN",
    }));
    return {
      kind: "account",
      accountId: act,
      campaigns,
      error: campaigns.length ? null : "That ad account has no campaigns.",
    };
  };

  // An explicit act_ prefix is unambiguous.
  if (ref.toLowerCase().startsWith("act_")) {
    try {
      return await asAccount(ref);
    } catch (e) {
      return { ...empty, error: (e as Error).message };
    }
  }

  // Otherwise try it as a campaign / ad set / ad first — resolveTaggedId
  // already handles all three and tells us the home account.
  try {
    const { campaignId, account } = await resolveTaggedId(ref);
    const info = (await graph(campaignId, { fields: "id,name,status" })) as {
      id?: string;
      name?: string;
      status?: string;
    };
    return {
      kind: "campaign",
      accountId: account,
      campaigns: [
        {
          id: String(info.id ?? campaignId),
          name: info.name ?? "(unnamed)",
          status: info.status ?? "UNKNOWN",
        },
      ],
      error: null,
    };
  } catch {
    // Not an object we can read — a bare ad account number is the likely case.
    try {
      return await asAccount(`act_${ref}`);
    } catch (e) {
      return {
        ...empty,
        error:
          (e as Error).message ||
          "Couldn't find that in Meta. Check the id, and that the System User can see this ad account.",
      };
    }
  }
}

// ── Reconciling live ads against the staff directory ────────────────────────

export interface AdAccountSummary {
  id: string;
  name: string;
}

/**
 * Every ad account this System User can see.
 *
 * Used to answer "who has live ads?" without anyone having to list the
 * accounts by hand. If the token is scoped to specific accounts rather than a
 * whole business this returns only those — which is correct, since an account
 * we can't see is one we can't report on either way.
 */
export async function listAccessibleAdAccounts(): Promise<AdAccountSummary[]> {
  if (!metaTokenSet()) return [];
  const out: AdAccountSummary[] = [];
  let path = "me/adaccounts";
  let params: Record<string, string> = { fields: "id,name", limit: "200" };
  // Paginate: a business with many accounts won't fit one page, and silently
  // reporting on the first 200 would look like a complete answer.
  for (let page = 0; page < 20; page++) {
    const res = (await graph(path, params)) as {
      data?: Array<{ id?: string; name?: string }>;
      paging?: { next?: string; cursors?: { after?: string } };
    };
    for (const a of res.data ?? []) {
      if (a.id) out.push({ id: String(a.id), name: a.name ?? "(unnamed)" });
    }
    const after = res.paging?.cursors?.after;
    if (!res.paging?.next || !after) break;
    path = "me/adaccounts";
    params = { fields: "id,name", limit: "200", after };
  }
  return out;
}

/** Campaigns in one ad account, with the status that says whether it's live. */
export async function campaignsInAccount(
  accountId: string
): Promise<ConnectedCampaign[]> {
  const act = normaliseAct(accountId) ?? accountId;
  const res = (await graph(`${act}/campaigns`, {
    fields: "id,name,status,effective_status",
    limit: "200",
  })) as {
    data?: Array<{
      id: string;
      name?: string;
      status?: string;
      effective_status?: string;
    }>;
  };
  return (res.data ?? []).map((c) => ({
    id: String(c.id),
    name: c.name ?? "(unnamed)",
    // effective_status accounts for the account or campaign being paused
    // upstream — `status` alone can say ACTIVE on a campaign that isn't
    // actually delivering, which is exactly the distinction being checked.
    status: c.effective_status ?? c.status ?? "UNKNOWN",
  }));
}
