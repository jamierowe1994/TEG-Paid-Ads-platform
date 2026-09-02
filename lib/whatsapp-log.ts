import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { DATA_DIR } from "./data-dir";
import { hasDb, q } from "./db";

/* Delivery log for WhatsApp alerts — Postgres on Railway, JSON locally.
 *
 * Why this exists: agents started saying lead alerts were arriving late, and
 * there was no way to tell whether that was true, let alone where the time
 * went. Every alert attempt now leaves a row, so the question is answerable.
 *
 * The two clocks are NOT interchangeable:
 *   apiMs    — how long Meta's API took to accept the send. Small always.
 *   latencyMs — Meta's lead submission time to our message going out. This is
 *               the number the agent feels, and the 5-minute lead poll lives
 *               inside it. A healthy latency is ~0-6 minutes; consistently
 *               more than that means the sync, not WhatsApp, is the problem.
 *
 * And "ok" means Meta ACCEPTED the template, not that it arrived. Real
 * delivery needs Meta's status webhook (see app/api/webhooks/whatsapp);
 * until that's configured, deliveredAt stays null everywhere and the admin
 * tab says so rather than pretending.
 */

export type WhatsAppKind = "new_lead" | "resurface" | "nudge" | "test";

export interface WhatsAppLogEntry {
  id: string;
  sentAt: string;
  kind: WhatsAppKind;
  userId: string | null;
  agentName: string;
  brandId: string | null;
  leadId: string | null;
  leadName: string;
  template: string;
  /** The deep-linking template was used (message opens the exact lead). */
  dynamic: boolean;
  /** The deep-link template was rejected and the static one went instead. */
  fellBack: boolean;
  ok: boolean;
  reason: string | null;
  /** Last 4 digits only — enough to identify a number, not to hold one. */
  toMasked: string;
  messageId: string | null;
  leadReceivedAt: string | null;
  latencyMs: number | null;
  apiMs: number | null;
  deliveredAt: string | null;
  readAt: string | null;
  failedAt: string | null;
  failDetail: string | null;
}

const FILE = path.join(DATA_DIR, "whatsapp-log.json");
// The file fallback is a dev convenience, not an archive — keep it small.
const FILE_KEEP = 500;
// Postgres keeps a month. Long enough to answer "was last week slow?",
// short enough that the table never needs thinking about.
const KEEP_DAYS = 30;

export function maskNumber(digits: string): string {
  const d = (digits || "").replace(/\D/g, "");
  return d ? `••••${d.slice(-4)}` : "";
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

interface LogRow {
  id: string;
  sent_at: string | Date;
  kind: string;
  user_id: string | null;
  agent_name: string;
  brand_id: string | null;
  lead_id: string | null;
  lead_name: string;
  template: string;
  dynamic: boolean;
  fell_back: boolean;
  ok: boolean;
  reason: string | null;
  to_masked: string;
  message_id: string | null;
  lead_received_at: string | Date | null;
  latency_ms: string | number | null;
  api_ms: number | null;
  delivered_at: string | Date | null;
  read_at: string | Date | null;
  failed_at: string | Date | null;
  fail_detail: string | null;
}

const iso = (v: string | Date | null) => (v ? new Date(v).toISOString() : null);

function fromRow(r: LogRow): WhatsAppLogEntry {
  return {
    id: r.id,
    sentAt: new Date(r.sent_at).toISOString(),
    kind: r.kind as WhatsAppKind,
    userId: r.user_id,
    agentName: r.agent_name,
    brandId: r.brand_id,
    leadId: r.lead_id,
    leadName: r.lead_name,
    template: r.template,
    dynamic: r.dynamic,
    fellBack: r.fell_back,
    ok: r.ok,
    reason: r.reason,
    toMasked: r.to_masked,
    messageId: r.message_id,
    leadReceivedAt: iso(r.lead_received_at),
    // BIGINT comes back as a string from pg.
    latencyMs: r.latency_ms === null ? null : Number(r.latency_ms),
    apiMs: r.api_ms,
    deliveredAt: iso(r.delivered_at),
    readAt: iso(r.read_at),
    failedAt: iso(r.failed_at),
    failDetail: r.fail_detail,
  };
}

async function readFile(): Promise<WhatsAppLogEntry[]> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8")) as WhatsAppLogEntry[];
  } catch {
    return [];
  }
}

async function writeFile(rows: WhatsAppLogEntry[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(rows.slice(0, FILE_KEEP), null, 2), "utf8");
}

/** Record one alert attempt. Never throws — logging must not break a send. */
export async function recordWhatsApp(
  entry: Omit<WhatsAppLogEntry, "id" | "sentAt" | "deliveredAt" | "readAt" | "failedAt" | "failDetail"> &
    Partial<Pick<WhatsAppLogEntry, "sentAt">>
): Promise<void> {
  const row: WhatsAppLogEntry = {
    ...entry,
    id: uid(),
    sentAt: entry.sentAt ?? new Date().toISOString(),
    deliveredAt: null,
    readAt: null,
    failedAt: null,
    failDetail: null,
  };
  try {
    if (hasDb()) {
      await q(
        `INSERT INTO whatsapp_log
           (id, sent_at, kind, user_id, agent_name, brand_id, lead_id, lead_name,
            template, dynamic, fell_back, ok, reason, to_masked, message_id,
            lead_received_at, latency_ms, api_ms)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        [
          row.id,
          row.sentAt,
          row.kind,
          row.userId,
          row.agentName,
          row.brandId,
          row.leadId,
          row.leadName,
          row.template,
          row.dynamic,
          row.fellBack,
          row.ok,
          row.reason,
          row.toMasked,
          row.messageId,
          row.leadReceivedAt,
          row.latencyMs,
          row.apiMs,
        ]
      );
      // Cheap enough at this volume, and means nobody has to remember a cron.
      await q(
        `DELETE FROM whatsapp_log WHERE sent_at < NOW() - INTERVAL '${KEEP_DAYS} days'`
      );
      return;
    }
    const all = await readFile();
    all.unshift(row);
    await writeFile(all);
  } catch (e) {
    console.error("[whatsapp-log] could not record:", e);
  }
}

/** Stamp a delivery status from Meta's webhook, found by message id. */
export async function markWhatsAppStatus(
  messageId: string,
  status: "sent" | "delivered" | "read" | "failed",
  detail?: string
): Promise<void> {
  const now = new Date().toISOString();
  const col =
    status === "delivered"
      ? "delivered_at"
      : status === "read"
        ? "read_at"
        : status === "failed"
          ? "failed_at"
          : null;
  if (!col) return; // "sent" adds nothing — we already logged the send.
  try {
    if (hasDb()) {
      await q(
        `UPDATE whatsapp_log
            SET ${col} = COALESCE(${col}, $2),
                fail_detail = COALESCE($3, fail_detail)
          WHERE message_id = $1`,
        [messageId, now, detail ?? null]
      );
      return;
    }
    const all = await readFile();
    const hit = all.find((r) => r.messageId === messageId);
    if (!hit) return;
    if (status === "delivered") hit.deliveredAt ??= now;
    if (status === "read") hit.readAt ??= now;
    if (status === "failed") {
      hit.failedAt ??= now;
      hit.failDetail = detail ?? hit.failDetail;
    }
    await writeFile(all);
  } catch (e) {
    console.error("[whatsapp-log] could not update status:", e);
  }
}

export async function listWhatsAppLog(limit = 200): Promise<WhatsAppLogEntry[]> {
  if (hasDb()) {
    const rows = await q<LogRow>(
      "SELECT * FROM whatsapp_log ORDER BY sent_at DESC LIMIT $1",
      [limit]
    );
    return rows.map(fromRow);
  }
  return (await readFile()).slice(0, limit);
}

/* ── Summary ──────────────────────────────────────────────────────────────
 * Computed in JS from the recent rows rather than in SQL, so the file
 * fallback and Postgres can't give different answers — and so the whole
 * thing works identically in dev.
 */
export interface WhatsAppSummary {
  windowDays: number;
  attempted: number;
  accepted: number;
  failed: number;
  /** Failures grouped by Meta's reason, worst first. */
  reasons: { reason: string; count: number }[];
  /** Lead-submitted -> alert-sent, in ms. Null when nothing measurable. */
  medianLatencyMs: number | null;
  p90LatencyMs: number | null;
  worstLatencyMs: number | null;
  /** Alerts that took longer than 15 minutes to go out. */
  slow: number;
  deliveryKnown: boolean;
  delivered: number;
  read: number;
  bounced: number;
  /** Deep-link template rejected, static sent instead. */
  fellBack: number;
  byDay: { day: string; sent: number; failed: number; medianLatencyMs: number | null }[];
}

export const SLOW_MS = 15 * 60 * 1000;

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

export function summariseWhatsApp(
  entries: WhatsAppLogEntry[],
  windowDays = 7
): WhatsAppSummary {
  const since = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  const rows = entries.filter((e) => new Date(e.sentAt).getTime() >= since);
  const latencies = rows
    .filter((e) => e.ok && typeof e.latencyMs === "number" && e.latencyMs! >= 0)
    .map((e) => e.latencyMs as number);

  const reasonCounts = new Map<string, number>();
  for (const r of rows) {
    if (r.ok) continue;
    const key = r.reason ?? "Unknown";
    reasonCounts.set(key, (reasonCounts.get(key) ?? 0) + 1);
  }

  const days = new Map<string, WhatsAppLogEntry[]>();
  for (const r of rows) {
    const day = r.sentAt.slice(0, 10);
    const list = days.get(day) ?? [];
    list.push(r);
    days.set(day, list);
  }

  return {
    windowDays,
    attempted: rows.length,
    accepted: rows.filter((e) => e.ok).length,
    failed: rows.filter((e) => !e.ok).length,
    reasons: [...reasonCounts.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count),
    medianLatencyMs: median(latencies),
    p90LatencyMs: percentile(latencies, 90),
    worstLatencyMs: latencies.length ? Math.max(...latencies) : null,
    slow: latencies.filter((ms) => ms > SLOW_MS).length,
    deliveryKnown: rows.some((e) => e.deliveredAt || e.readAt || e.failedAt),
    delivered: rows.filter((e) => e.deliveredAt).length,
    read: rows.filter((e) => e.readAt).length,
    bounced: rows.filter((e) => e.failedAt).length,
    fellBack: rows.filter((e) => e.fellBack).length,
    byDay: [...days.entries()]
      .map(([day, list]) => ({
        day,
        sent: list.filter((e) => e.ok).length,
        failed: list.filter((e) => !e.ok).length,
        medianLatencyMs: median(
          list
            .filter((e) => e.ok && typeof e.latencyMs === "number")
            .map((e) => e.latencyMs as number)
        ),
      }))
      .sort((a, b) => (a.day < b.day ? 1 : -1)),
  };
}
