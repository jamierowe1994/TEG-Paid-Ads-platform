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
  MetaApiError,
  explainMetaError,
} from "./meta";
import {
  recordLeadSyncRun,
  claimLeadSyncAlert,
  releaseLeadSyncAlert,
  clearLeadSyncStatus,
  type LeadSyncStatus,
} from "./lead-sync-status";
import { sendSystemEmail } from "./mailer";
import { leadSyncFailingEmail } from "./emails";
import { findById, listUsers } from "./users-store";
import { createLead, resurfaceDueLeads, uid } from "./leads-store";
import { syncReferralFromLead } from "./referrals-store";
import { sendNewLeadAlert } from "./whatsapp";
import { sendPushToUser } from "./push";
import { BRANDS, brandById } from "./brands";
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
  errorCode?: number; // Meta's numeric error code, when Meta was the cause
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
    // Forms first, even for a brand with nobody to route to yet: it's the
    // call that proves Launch Pad can still read the Page, and a brand that
    // can't should show as failing BEFORE its first agent goes live.
    const forms = await getLeadgenForms(brandId);
    if (!forms || forms.length === 0) return out;
    out.forms = forms.length;
    const pageToken = (await getPageAccessToken(brandId)) ?? undefined;

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
    // Route STRICTLY by campaign: a lead only lands in an agent's funnel if it
    // came from a campaign they've tagged. There used to be a "sole agent gets
    // everything" fallback, but a brand's Facebook Page hosts leads from lots
    // of campaigns/regions, so that swept the whole Page into one agent (the
    // 600+-lead over-capture). No tagged campaigns → nothing to route.
    if (routes.size === 0) return out;

    for (const form of forms) {
      const metaLeads = await getFormLeads(form.id, LEADS_PER_FORM, pageToken);
      for (const ml of metaLeads) {
        const target = ml.campaignId ? routes.get(ml.campaignId) : undefined;
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
          campaignId: ml.campaignId ?? null,
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
    if (e instanceof MetaApiError && e.code !== undefined) out.errorCode = e.code;
  }
  return out;
}

// Who hears about it when a brand's sync breaks. Email, because that's how
// every other admin notice goes out (WhatsApp is template-only and reserved
// for agents' lead alerts).
const ALERT_TO =
  process.env.LEAD_SYNC_ALERT_EMAIL ?? "james@therecruitmentexperts.co.uk";

// Two failed runs in a row (ten minutes) before alerting, so one Meta blip
// doesn't send an email. The admin view shows red from the first failure.
const ALERT_AFTER_FAILURES = 2;

// Persist the run and, on a brand's move from working to failing, send ONE
// alert for that streak. Never throws: bookkeeping must not stop the sync.
async function recordAndAlert(r: BrandSyncResult): Promise<void> {
  let status: LeadSyncStatus;
  try {
    status = await recordLeadSyncRun(r);
  } catch (e) {
    console.error("[lead-sync] couldn't record status for", r.brandId, e);
    return;
  }
  if (!r.error || status.failCount < ALERT_AFTER_FAILURES || status.alertedAt) {
    return;
  }
  try {
    if (!(await claimLeadSyncAlert(r.brandId))) return;
    const mail = leadSyncFailingEmail({
      brandName: brandById(r.brandId)?.name ?? r.brandId,
      explanation: explainMetaError(r.error, r.errorCode),
      metaError: r.error,
      failingSince: status.failingSince ?? status.lastRunAt,
    });
    const sent = await sendSystemEmail({
      to: ALERT_TO,
      subject: mail.subject,
      body: mail.html,
      html: true,
    });
    if (!sent.sent) {
      console.error("[lead-sync] failure alert not sent:", sent.reason, sent.detail);
      await releaseLeadSyncAlert(r.brandId);
    }
  } catch (e) {
    console.error("[lead-sync] failure alert errored:", e);
    await releaseLeadSyncAlert(r.brandId).catch(() => {});
  }
}

// "Saved for later" leads whose comeback date has arrived: bring them back
// as new and ping the agent — same alert as a fresh lead, they should treat
// it like one.
async function resurfaceSnoozedLeads(): Promise<void> {
  try {
    const due = await resurfaceDueLeads();
    for (const lead of due) {
      // Referral-sourced leads mirror the stage move back to the referrer.
      if (lead.referralId) {
        try {
          await syncReferralFromLead(lead.id, "new");
        } catch {
          /* mirror is best-effort */
        }
      }
      try {
        await sendPushToUser(lead.userId, {
          title: "Lead back on 🔁",
          body: `${lead.name} said they'd be ready about now — worth a call.`,
          url: `/dashboard/leads?lead=${encodeURIComponent(lead.id)}`,
          tag: `lead-${lead.id}`,
        });
      } catch {
        /* push is best-effort */
      }
      try {
        const user = await findById(lead.userId);
        if (user) {
          await sendNewLeadAlert({
            toMobile: user.mobile,
            agentName: user.name,
            leadName: `${lead.name} (back on — they said they'd be ready now)`,
            leadId: lead.id,
            userId: user.id,
            brandId: user.brandId,
            // No lead-wait to measure here: a resurfaced lead is due now,
            // not newly submitted, so latency would be days and meaningless.
            kind: "resurface",
          });
        }
      } catch {
        /* alert is best-effort; the lead is already back in the funnel */
      }
    }
  } catch {
    /* next tick retries */
  }
}

// Sync every brand that has a Page wired up. Serial on purpose — gentle on
// Meta's rate limits, and a five-minute cadence doesn't need speed. Runs are
// mutually exclusive: an admin "run now" landing mid-tick joins the run in
// flight rather than racing it (double resurfacing = double alerts).
let inFlight: Promise<SyncRun> | null = null;

export function syncAllBrands(): Promise<SyncRun> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      await resurfaceSnoozedLeads();
      const results: BrandSyncResult[] = [];
      if (metaTokenSet()) {
        const unconfigured: string[] = [];
        for (const brand of BRANDS) {
          if (await pageConfigured(brand.id)) {
            const r = await syncBrand(brand.id);
            results.push(r);
            await recordAndAlert(r);
          } else {
            unconfigured.push(brand.id);
          }
        }
        // A brand whose Page was removed has no sync to report on.
        await clearLeadSyncStatus(unconfigured).catch(() => {});
      }
      lastRun = { at: new Date().toISOString(), results };
      return lastRun;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
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
