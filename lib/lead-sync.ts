import "server-only";
import {
  getLeadgenForms,
  getFormLeads,
  getPageAccessToken,
  mapLeadFields,
  parseCampaignIds,
  resolveCampaignIds,
  pageConfigured,
  metaTokenSet,
} from "./meta";
import { listUsers } from "./users-store";
import { createLead, uid } from "./leads-store";
import { BRANDS } from "./brands";
import type { Lead } from "./types";

// Automatic Instant Form lead sync — the "live" pipe. Every few minutes,
// pull each configured brand's lead forms and drop anything new into the
// right agent's funnel (matched by the lead's campaign against the agent's
// tagged campaigns; if the brand has exactly one agent running campaigns,
// everything routes to them). Import is idempotent on Meta's lead id, and
// leads keep their ORIGINAL submission date.
//
// Alerts: only leads submitted within the last day fire the WhatsApp ping —
// hooking a brand up never floods anyone with alerts for old leads.

const NOTIFY_WINDOW_MS = 24 * 60 * 60 * 1000;
const SYNC_INTERVAL_MS = 5 * 60 * 1000;
// Per run, per form: how deep to look. New leads arrive at the head, and
// anything older was either imported already (skipped) or gets picked up by
// the one-off backfill button.
const LEADS_PER_FORM = 200;

export interface BrandSyncResult {
  brandId: string;
  forms: number;
  imported: number;
  notified: number;
  skipped: number;
  unrouted: number;
  error?: string;
}

export interface SyncRun {
  at: string;
  results: BrandSyncResult[];
}

let lastRun: SyncRun | null = null;

export function lastSyncRun(): SyncRun | null {
  return lastRun;
}

async function syncBrand(brandId: string): Promise<BrandSyncResult> {
  const out: BrandSyncResult = {
    brandId,
    forms: 0,
    imported: 0,
    notified: 0,
    skipped: 0,
    unrouted: 0,
  };
  try {
    // Who gets the leads: campaign id -> agent, from the CRM's campaign tags.
    const agents = (await listUsers()).filter(
      (u) => u.brandId === brandId && parseCampaignIds(u.metaCampaignId).length > 0
    );
    const routes = new Map<string, string>();
    for (const a of agents) {
      const resolved = await resolveCampaignIds(
        parseCampaignIds(a.metaCampaignId)
      );
      for (const cid of resolved) routes.set(cid, a.id);
    }
    // One agent running ads on the brand → everything is theirs, even leads
    // whose campaign we can't read.
    const soleAgentId = agents.length === 1 ? agents[0].id : null;
    if (routes.size === 0 && !soleAgentId) return out;

    const forms = await getLeadgenForms(brandId);
    if (!forms || forms.length === 0) return out;
    const pageToken = (await getPageAccessToken(brandId)) ?? undefined;

    for (const form of forms) {
      out.forms++;
      const metaLeads = await getFormLeads(form.id, LEADS_PER_FORM, pageToken);
      for (const ml of metaLeads) {
        const target =
          (ml.campaignId && routes.get(ml.campaignId)) || soleAgentId;
        if (!target) {
          out.unrouted++;
          continue;
        }
        const { name, phone, email, extra } = mapLeadFields(ml.fields);
        const receivedAt = new Date(ml.createdTime).toISOString();
        const fresh =
          Date.now() - new Date(ml.createdTime).getTime() < NOTIFY_WINDOW_MS;
        const lead: Lead = {
          id: uid(),
          name,
          phone,
          email,
          source: ml.platform === "ig" ? "instagram" : "facebook",
          note: extra || "",
          stage: "new",
          receivedAt,
          history: [{ stage: "new", at: receivedAt }],
          adName: ml.adName,
          metaLeadId: ml.id,
        };
        const inserted = await createLead(target, lead, { notify: fresh });
        if (inserted) {
          out.imported++;
          if (fresh) out.notified++;
        } else {
          out.skipped++;
        }
      }
    }
  } catch (e) {
    out.error = e instanceof Error ? e.message : "Sync failed";
  }
  return out;
}

// Sync every brand that has a Page wired up. Serial on purpose — gentle on
// Meta's rate limits, and a five-minute cadence doesn't need speed.
export async function syncAllBrands(): Promise<SyncRun> {
  const results: BrandSyncResult[] = [];
  if (metaTokenSet()) {
    for (const brand of BRANDS) {
      if (await pageConfigured(brand.id)) {
        results.push(await syncBrand(brand.id));
      }
    }
  }
  lastRun = { at: new Date().toISOString(), results };
  return lastRun;
}

// Background loop, started once per server process (instrumentation.ts).
// The globalThis guard stops dev hot-reload stacking intervals.
const LOOP_KEY = Symbol.for("teg.leadSyncLoop");

export function startLeadSyncLoop(): void {
  const g = globalThis as { [LOOP_KEY]?: boolean };
  if (g[LOOP_KEY]) return;
  g[LOOP_KEY] = true;
  const tick = () => {
    syncAllBrands().catch(() => {
      /* next tick retries; per-brand errors are captured in the run */
    });
  };
  // First pass shortly after boot (lets the server settle), then steady.
  setTimeout(tick, 15_000);
  setInterval(tick, SYNC_INTERVAL_MS);
}
