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

// Meta recommends signing server calls with appsecret_proof.
function appSecretProof(): string | undefined {
  const secret = process.env.META_APP_SECRET;
  if (!secret) return undefined;
  return crypto.createHmac("sha256", secret).update(token()).digest("hex");
}

async function graph(
  path: string,
  params: Record<string, string>
): Promise<Record<string, unknown>> {
  const q = new URLSearchParams({ access_token: token(), ...params });
  const proof = appSecretProof();
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
    date_preset: datePreset,
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

// Date ranges offered in the admin. Meta's presets exclude "today", matching
// Ads Manager's own windows.
export const META_DATE_PRESETS = [
  { id: "last_7d", label: "7 days" },
  { id: "last_14d", label: "14 days" },
  { id: "last_30d", label: "30 days" },
  { id: "last_90d", label: "90 days" },
] as const;

const VALID_PRESETS = new Set(META_DATE_PRESETS.map((p) => p.id));

export function sanitizePreset(p: string | null | undefined): string {
  return p && VALID_PRESETS.has(p as never) ? p : "last_30d";
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

// The forms on a brand's Page, most recently active first. Returns null if
// no Page is configured for the brand.
export async function getLeadgenForms(
  brandId: string
): Promise<LeadgenForm[] | null> {
  const pid = await pageId(brandId);
  if (!pid) return null;
  const data = (await graph(`${pid}/leadgen_forms`, {
    fields: "id,name,status,leads_count",
    limit: "200",
  })) as { data?: Array<Record<string, unknown>> };
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
  platform: string | null; // "fb" | "ig"
  fields: Record<string, string>; // flattened field_data (name -> first value)
}

function flattenFieldData(
  fieldData: Array<{ name: string; values?: string[] }> | undefined
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fieldData ?? []) out[f.name] = f.values?.[0] ?? "";
  return out;
}

// Every lead Meta still holds for one form, oldest pagination first, capped
// at maxLeads as a sane ceiling for a one-off backfill.
export async function getFormLeads(
  formId: string,
  maxLeads = 2000
): Promise<MetaLead[]> {
  const leads: MetaLead[] = [];
  let after: string | undefined;
  while (leads.length < maxLeads) {
    const params: Record<string, string> = {
      fields: "id,created_time,field_data,ad_name,platform",
      limit: "100",
    };
    if (after) params.after = after;
    const data = (await graph(`${formId}/leads`, params)) as {
      data?: Array<Record<string, unknown>>;
      paging?: { cursors?: { after?: string } };
    };
    const rows = data.data ?? [];
    for (const r of rows) {
      leads.push({
        id: String(r.id),
        createdTime: String(r.created_time ?? new Date().toISOString()),
        adName: r.ad_name ? String(r.ad_name) : null,
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
