import "server-only";
import { getLinkedInToken, setLinkedInToken } from "./linkedin-store";
import { getBrandMetaMap } from "./brand-meta-store";
import { BRANDS } from "./brands";

// LinkedIn Marketing API client. OAuth 2.0 (3-legged) with auto-refresh, then
// reads sponsored-account analytics. Config via env:
//   LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET  — from the LinkedIn app (Auth tab)
//   APP_URL                                       — public origin (for the redirect URI)
// Ad accounts are set per brand in the admin (brand_meta.linkedin_ad_account).

const OAUTH = "https://www.linkedin.com/oauth/v2";
const API = "https://api.linkedin.com/rest";
const VERSION = "202409"; // LinkedIn-Version header (YYYYMM)
const SCOPES = ["r_ads", "r_ads_reporting"];

function appUrl(): string {
  return (
    process.env.APP_URL ??
    "https://teg-paid-ads-platform-production.up.railway.app"
  );
}

export function linkedinRedirectUri(): string {
  return `${appUrl()}/api/linkedin/callback`;
}

export function linkedinConfigured(): boolean {
  return !!(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET);
}

export function linkedinAuthorizeUrl(state: string): string {
  const p = new URLSearchParams({
    response_type: "code",
    client_id: process.env.LINKEDIN_CLIENT_ID ?? "",
    redirect_uri: linkedinRedirectUri(),
    state,
    scope: SCOPES.join(" "),
  });
  return `${OAUTH}/authorization?${p.toString()}`;
}

// Exchange an auth code for tokens and store them.
export async function linkedinExchangeCode(code: string): Promise<void> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: linkedinRedirectUri(),
    client_id: process.env.LINKEDIN_CLIENT_ID ?? "",
    client_secret: process.env.LINKEDIN_CLIENT_SECRET ?? "",
  });
  const res = await fetch(`${OAUTH}/accessToken`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
    error_description?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description ?? "LinkedIn token exchange failed");
  }
  await setLinkedInToken({
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: new Date(Date.now() + (data.expires_in ?? 0) * 1000).toISOString(),
  });
}

async function refreshToken(refresh: string): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refresh,
    client_id: process.env.LINKEDIN_CLIENT_ID ?? "",
    client_secret: process.env.LINKEDIN_CLIENT_SECRET ?? "",
  });
  const res = await fetch(`${OAUTH}/accessToken`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
    error_description?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description ?? "LinkedIn token refresh failed");
  }
  await setLinkedInToken({
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refresh,
    expiresAt: new Date(Date.now() + (data.expires_in ?? 0) * 1000).toISOString(),
  });
  return data.access_token;
}

// A valid access token, refreshing if it's expired/near expiry.
async function validToken(): Promise<string | null> {
  const t = await getLinkedInToken();
  if (!t) return null;
  const soon = Date.now() + 5 * 60 * 1000; // refresh within 5 min of expiry
  if (t.expiresAt && new Date(t.expiresAt).getTime() < soon) {
    if (!t.refreshToken) return t.accessToken; // can't refresh; use till it dies
    try {
      return await refreshToken(t.refreshToken);
    } catch {
      return t.accessToken;
    }
  }
  return t.accessToken;
}

async function api(
  path: string,
  token: string
): Promise<Record<string, unknown>> {
  const res = await fetch(`${API}/${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "LinkedIn-Version": VERSION,
      "X-Restli-Protocol-Version": "2.0.0",
    },
    cache: "no-store",
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const msg = (data?.message as string) ?? `LinkedIn API error ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

export interface LinkedInSnapshot {
  brandId: string;
  impressions: number;
  clicks: number;
  spend: number;
  leads: number;
  costPerLead: number | null;
}

function ymd(d: Date) {
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
}

// Last-30-day account analytics for one brand's LinkedIn sponsored account.
export async function getLinkedInSnapshot(
  brandId: string
): Promise<LinkedInSnapshot | null> {
  const map = await getBrandMetaMap();
  const raw = map[brandId]?.linkedinAdAccount;
  if (!raw) return null;
  const token = await validToken();
  if (!token) return null;

  const accId = raw.replace(/\D/g, "");
  const end = new Date();
  const start = new Date(Date.now() - 30 * 86400000);
  const s = ymd(start);
  const e = ymd(end);
  const dateRange = `(start:(year:${s.year},month:${s.month},day:${s.day}),end:(year:${e.year},month:${e.month},day:${e.day}))`;
  const accounts = `List(urn%3Ali%3AsponsoredAccount%3A${accId})`;
  const fields = "impressions,clicks,costInLocalCurrency,oneClickLeads,externalWebsiteConversions";
  const path =
    `adAnalytics?q=analytics&pivot=ACCOUNT&timeGranularity=ALL` +
    `&dateRange=${dateRange}&accounts=${accounts}&fields=${fields}`;

  const data = await api(path, token);
  const row =
    ((data.elements as Array<Record<string, unknown>>) ?? [])[0] ?? {};
  const spend = Number(row.costInLocalCurrency ?? 0);
  const leads =
    Number(row.oneClickLeads ?? 0) + Number(row.externalWebsiteConversions ?? 0);
  return {
    brandId,
    impressions: Number(row.impressions ?? 0),
    clicks: Number(row.clicks ?? 0),
    spend,
    leads,
    costPerLead: leads > 0 ? spend / leads : null,
  };
}

// Which brands have a LinkedIn account set.
export async function linkedinConfiguredBrandIds(): Promise<string[]> {
  const map = await getBrandMetaMap();
  return BRANDS.map((b) => b.id).filter((id) => !!map[id]?.linkedinAdAccount);
}

// Connection status for the admin (is the app configured + do we hold a token).
export async function linkedinStatus(): Promise<{
  configured: boolean;
  connected: boolean;
  expiresAt: string | null;
}> {
  const t = await getLinkedInToken();
  return {
    configured: linkedinConfigured(),
    connected: !!t?.accessToken,
    expiresAt: t?.expiresAt ?? null,
  };
}
