import "server-only";
import crypto from "crypto";

// Meta Marketing API client. Reads TRE's ad-account stats using the System
// User token. Configured entirely via env vars (set in Railway), so nothing
// secret ever reaches the client:
//   META_SYSTEM_TOKEN   — the never-expiring System User token
//   META_APP_SECRET     — used to sign requests (appsecret_proof)
//   TRE_AD_ACCOUNT_ID   — TRE's ad account (with or without the act_ prefix)
//   TRE_PAGE_ID         — TRE's page (used for the leads webhook later)
//
// The other brands slot in the same way once their tokens/accounts land.

const GRAPH = "https://graph.facebook.com/v21.0";

function token(): string {
  return process.env.META_SYSTEM_TOKEN ?? "";
}

function accountId(): string {
  const id = process.env.TRE_AD_ACCOUNT_ID ?? "";
  return id.startsWith("act_") ? id : `act_${id}`;
}

export function metaConfigured(): boolean {
  return !!(token() && process.env.TRE_AD_ACCOUNT_ID);
}

// Meta recommends signing server calls with appsecret_proof (HMAC of the
// token with the app secret). Included when the secret is set.
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

// Lightweight connection check — confirms the token + account work without
// returning any ad data (safe to expose on the health endpoint). Reports the
// account name only so we can confirm it's the right account.
export async function pingMeta(): Promise<{
  configured: boolean;
  ok: boolean;
  account?: string;
  error?: string;
}> {
  if (!metaConfigured()) return { configured: false, ok: false };
  try {
    const acc = (await graph(accountId(), { fields: "name" })) as {
      name: string;
    };
    return { configured: true, ok: true, account: acc.name };
  } catch (e) {
    return {
      configured: true,
      ok: false,
      error: e instanceof Error ? e.message : "Meta request failed",
    };
  }
}

export interface TreSnapshot {
  account: { name: string; status: number; currency: string };
  impressions: number;
  clicks: number;
  spend: number;
  ctr: number;
  cpc: number;
  leads: number;
  costPerLead: number | null;
  datePreset: string;
}

// Live stats for TRE's ad account. `datePreset` e.g. last_7d, last_30d, today.
export async function getTreSnapshot(
  datePreset = "last_30d"
): Promise<TreSnapshot> {
  const account = (await graph(accountId(), {
    fields: "name,account_status,currency",
  })) as { name: string; account_status: number; currency: string };

  const insights = (await graph(`${accountId()}/insights`, {
    fields: "impressions,clicks,spend,cpc,ctr,actions",
    date_preset: datePreset,
  })) as { data?: Array<Record<string, unknown>> };

  const row = insights.data?.[0] ?? {};
  const actions = (row.actions as Array<{ action_type: string; value: string }>) ?? [];
  // Lead-form submissions come through as "leadgen"/"…lead" action types.
  const leads = actions
    .filter((a) => /lead/i.test(a.action_type))
    .reduce((sum, a) => sum + Number(a.value ?? 0), 0);
  const spend = Number(row.spend ?? 0);

  return {
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
  };
}
