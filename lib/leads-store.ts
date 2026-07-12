import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { DATA_DIR } from "./data-dir";
import { hasDb, q } from "./db";
import { findById } from "./users-store";
import { sendNewLeadAlert } from "./whatsapp";
import type { CrmMatch, Lead, LeadStage } from "./types";

// Leads, server-side — Postgres on Railway, JSON locally. Each lead belongs
// to one agent (user_id). Leads arrive from accepted referrals now, and from
// the Meta lead webhook later — both via createLead(). No demo seeding.

const FILE = path.join(DATA_DIR, "leads.json");

type OwnedLead = Lead & { userId: string };

interface LeadRow {
  id: string;
  user_id: string;
  name: string;
  phone: string;
  email: string;
  source: string;
  note: string;
  stage: string;
  received_at: string | Date;
  history: unknown;
  referral_id: string | null;
  notes: unknown;
  appointment_at: string | Date | null;
  meta_lead_id: string | null;
  campaign_id: string | null;
  ad_name: string | null;
  rex_contact_id: string | null;
  rex_lead_id: string | null;
  archived_at: string | Date | null;
  resurface_at: string | Date | null;
  crm_match: unknown;
}

function fromRow(row: LeadRow): Lead {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    source: row.source as Lead["source"],
    note: row.note,
    stage: row.stage as LeadStage,
    receivedAt: new Date(row.received_at).toISOString(),
    history: (Array.isArray(row.history) ? row.history : []) as Lead["history"],
    referralId: row.referral_id ?? null,
    notes: (Array.isArray(row.notes) ? row.notes : []) as Lead["notes"],
    appointmentAt: row.appointment_at
      ? new Date(row.appointment_at).toISOString()
      : null,
    metaLeadId: row.meta_lead_id ?? null,
    campaignId: row.campaign_id ?? null,
    adName: row.ad_name ?? null,
    rexContactId: row.rex_contact_id ?? null,
    rexLeadId: row.rex_lead_id ?? null,
    archivedAt: row.archived_at ? new Date(row.archived_at).toISOString() : null,
    resurfaceAt: row.resurface_at
      ? new Date(row.resurface_at).toISOString()
      : null,
    crmMatch: (row.crm_match as CrmMatch | null) ?? null,
  };
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

async function readAllFile(): Promise<OwnedLead[]> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8")) as OwnedLead[];
  } catch {
    return [];
  }
}

async function writeAllFile(leads: OwnedLead[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(leads, null, 2), "utf8");
}

// Best-effort WhatsApp nudge to the agent when a lead lands. Never awaited by
// createLead, and swallows its own errors, so it can't affect lead creation.
async function notifyNewLead(userId: string, lead: Lead): Promise<void> {
  try {
    const user = await findById(userId);
    if (user?.mobile) {
      await sendNewLeadAlert({
        toMobile: user.mobile,
        agentName: user.name,
        leadName: lead.name,
      });
    }
  } catch {
    /* ignore */
  }
}

// Creates a lead. Returns false (no-op) instead of inserting when `lead`
// carries a `metaLeadId` that's already been imported for this user — makes
// the Meta historic-leads backfill safe to re-run without duplicating leads.
// `opts.notify: false` skips the WhatsApp nudge (used for bulk/historic
// imports, where dozens of old leads landing at once shouldn't alert anyone).
export async function createLead(
  userId: string,
  lead: Lead,
  opts?: { notify?: boolean }
): Promise<boolean> {
  let inserted = true;
  if (hasDb()) {
    const rows = await q<{ id: string }>(
      `INSERT INTO leads (id, user_id, name, phone, email, source, note, stage, received_at, history, referral_id, meta_lead_id, campaign_id, ad_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (user_id, meta_lead_id) WHERE meta_lead_id IS NOT NULL DO NOTHING
       RETURNING id`,
      [
        lead.id,
        userId,
        lead.name,
        lead.phone,
        lead.email,
        lead.source,
        lead.note,
        lead.stage,
        lead.receivedAt,
        JSON.stringify(lead.history),
        lead.referralId ?? null,
        lead.metaLeadId ?? null,
        lead.campaignId ?? null,
        lead.adName ?? null,
      ]
    );
    inserted = rows.length > 0;
  } else {
    const all = await readAllFile();
    if (
      lead.metaLeadId &&
      all.some((l) => l.userId === userId && l.metaLeadId === lead.metaLeadId)
    ) {
      inserted = false;
    } else {
      all.push({ ...lead, userId });
      await writeAllFile(all);
    }
  }
  if (inserted && opts?.notify !== false) void notifyNewLead(userId, lead);
  return inserted;
}

// Every lead across all agents (admin activity feed). Carries userId so the
// caller can join brand/agent info.
export async function listAllLeads(): Promise<(Lead & { userId: string })[]> {
  if (hasDb()) {
    const rows = await q<LeadRow>(
      "SELECT * FROM leads ORDER BY received_at DESC"
    );
    return rows.map((r) => ({ ...fromRow(r), userId: r.user_id }));
  }
  return await readAllFile();
}

// List an agent's leads, newest first. Empty for a fresh account — real
// leads arrive from accepted referrals and (later) the Meta webhook.
export async function listLeadsForUser(userId: string): Promise<Lead[]> {
  if (hasDb()) {
    const rows = await q<LeadRow>(
      "SELECT * FROM leads WHERE user_id = $1 ORDER BY received_at DESC",
      [userId]
    );
    return rows.map(fromRow);
  }
  return (await readAllFile())
    .filter((l) => l.userId === userId)
    .map(({ userId: _omit, ...lead }) => lead)
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
}

// A single lead owned by userId (used by the Atlas push route). Returns
// undefined if it doesn't exist or belongs to someone else.
export async function getLead(
  userId: string,
  leadId: string
): Promise<Lead | undefined> {
  if (hasDb()) {
    const rows = await q<LeadRow>(
      "SELECT * FROM leads WHERE id = $2 AND user_id = $1",
      [userId, leadId]
    );
    return rows[0] ? fromRow(rows[0]) : undefined;
  }
  const all = await readAllFile();
  const found = all.find((l) => l.id === leadId && l.userId === userId);
  if (!found) return undefined;
  const { userId: _omit, ...lead } = found;
  return lead;
}

// Append an agent note to a lead (from the Call → Add notes panel).
export async function addLeadNote(
  userId: string,
  leadId: string,
  text: string
): Promise<Lead | undefined> {
  const trimmed = text.trim();
  if (!trimmed) return getLead(userId, leadId);
  const entry = { at: new Date().toISOString(), text: trimmed };
  if (hasDb()) {
    const rows = await q<LeadRow>(
      `UPDATE leads SET notes = COALESCE(notes,'[]'::jsonb) || $3::jsonb
         WHERE id = $2 AND user_id = $1 RETURNING *`,
      [userId, leadId, JSON.stringify([entry])]
    );
    return rows[0] ? fromRow(rows[0]) : undefined;
  }
  const all = await readAllFile();
  const idx = all.findIndex((l) => l.id === leadId && l.userId === userId);
  if (idx === -1) return undefined;
  all[idx] = { ...all[idx], notes: [...(all[idx].notes ?? []), entry] };
  await writeAllFile(all);
  const { userId: _omit, ...lead } = all[idx];
  return lead;
}

// Book (or rearrange) an appointment: store the date and mark the lead as
// converted (unless it's already been pushed to the CRM).
export async function bookAppointment(
  userId: string,
  leadId: string,
  at: string
): Promise<Lead | undefined> {
  const iso = new Date(at).toISOString();
  const existing = await getLead(userId, leadId);
  if (!existing) return undefined;
  const firstBook = existing.stage !== "converted" && existing.stage !== "pushed";
  const append = firstBook
    ? [{ stage: "converted", at: new Date().toISOString() }]
    : [];
  if (hasDb()) {
    const rows = await q<LeadRow>(
      `UPDATE leads
          SET appointment_at = $3,
              stage = CASE WHEN stage = 'pushed' THEN 'pushed' ELSE 'converted' END,
              history = history || $4::jsonb,
              archived_at = NULL, resurface_at = NULL
        WHERE id = $2 AND user_id = $1 RETURNING *`,
      [userId, leadId, iso, JSON.stringify(append)]
    );
    return rows[0] ? fromRow(rows[0]) : undefined;
  }
  const all = await readAllFile();
  const idx = all.findIndex((l) => l.id === leadId && l.userId === userId);
  if (idx === -1) return undefined;
  const cur = all[idx];
  all[idx] = {
    ...cur,
    appointmentAt: iso,
    stage: cur.stage === "pushed" ? "pushed" : "converted",
    archivedAt: null,
    resurfaceAt: null,
    history: [...cur.history, ...(append as Lead["history"])],
  };
  await writeAllFile(all);
  const { userId: _omit, ...lead } = all[idx];
  return lead;
}

// Cancel a booking — clears the date and drops the lead back into the funnel.
export async function cancelAppointment(
  userId: string,
  leadId: string
): Promise<Lead | undefined> {
  const entry = { stage: "attempt1" as LeadStage, at: new Date().toISOString() };
  if (hasDb()) {
    const rows = await q<LeadRow>(
      `UPDATE leads SET appointment_at = NULL, stage = 'attempt1',
              history = history || $3::jsonb,
              archived_at = NULL, resurface_at = NULL
        WHERE id = $2 AND user_id = $1 RETURNING *`,
      [userId, leadId, JSON.stringify([entry])]
    );
    return rows[0] ? fromRow(rows[0]) : undefined;
  }
  const all = await readAllFile();
  const idx = all.findIndex((l) => l.id === leadId && l.userId === userId);
  if (idx === -1) return undefined;
  all[idx] = {
    ...all[idx],
    appointmentAt: null,
    stage: "attempt1",
    archivedAt: null,
    resurfaceAt: null,
    history: [...all[idx].history, entry],
  };
  await writeAllFile(all);
  const { userId: _omit, ...lead } = all[idx];
  return lead;
}

// Count leads still at the "new" stage — drives the Leads nav dot.
export async function countNewLeads(userId: string): Promise<number> {
  if (hasDb()) {
    const rows = await q<{ n: string }>(
      "SELECT COUNT(*)::text AS n FROM leads WHERE user_id = $1 AND stage = 'new'",
      [userId]
    );
    return Number(rows[0]?.n ?? 0);
  }
  return (await readAllFile()).filter(
    (l) => l.userId === userId && l.stage === "new"
  ).length;
}

// Move a lead to a new stage (appends to its history). Only touches leads
// owned by userId — an agent can never modify someone else's lead.
// Working a lead also cancels any pending "save for later" comeback and
// un-archives it — otherwise the resurface engine would later clobber a
// worked (even pushed!) lead back to "new".
export async function updateLeadStage(
  userId: string,
  leadId: string,
  stage: LeadStage
): Promise<Lead | undefined> {
  const entry = { stage, at: new Date().toISOString() };
  if (hasDb()) {
    const rows = await q<LeadRow>(
      `UPDATE leads
         SET stage = $3, history = history || $4::jsonb,
             archived_at = NULL, resurface_at = NULL
       WHERE id = $2 AND user_id = $1
       RETURNING *`,
      [userId, leadId, stage, JSON.stringify([entry])]
    );
    return rows[0] ? fromRow(rows[0]) : undefined;
  }
  const all = await readAllFile();
  const idx = all.findIndex((l) => l.id === leadId && l.userId === userId);
  if (idx === -1) return undefined;
  all[idx] = {
    ...all[idx],
    stage,
    archivedAt: null,
    resurfaceAt: null,
    history: [...all[idx].history, entry],
  };
  await writeAllFile(all);
  const { userId: _omit, ...lead } = all[idx];
  return lead;
}

// The person was deleted inside Rex, so return the file to its pre-push
// state: back to "converted" (a push always starts from converted), Rex ids
// cleared, and a labelled timeline entry recording exactly what happened —
// which puts the normal "Push to REX" action back on the card.
export async function resetLeadFromRex(
  userId: string,
  leadId: string
): Promise<Lead | undefined> {
  const entry = {
    stage: "converted" as LeadStage,
    at: new Date().toISOString(),
    label: "Removed from REX — file reset",
  };
  if (hasDb()) {
    const rows = await q<LeadRow>(
      `UPDATE leads
          SET stage = 'converted', rex_contact_id = NULL, rex_lead_id = NULL,
              history = history || $3::jsonb
        WHERE id = $2 AND user_id = $1 AND stage = 'pushed'
        RETURNING *`,
      [userId, leadId, JSON.stringify([entry])]
    );
    return rows[0] ? fromRow(rows[0]) : undefined;
  }
  const all = await readAllFile();
  const idx = all.findIndex(
    (l) => l.id === leadId && l.userId === userId && l.stage === "pushed"
  );
  if (idx === -1) return undefined;
  all[idx] = {
    ...all[idx],
    stage: "converted",
    rexContactId: null,
    rexLeadId: null,
    history: [...all[idx].history, entry],
  };
  await writeAllFile(all);
  const { userId: _omit, ...lead } = all[idx];
  return lead;
}

// Records the Rex ids returned by a successful push, so a later Rex webhook
// (e.g. an Appraisal changing for this contact) can trace back to this lead.
export async function setLeadRexIds(
  userId: string,
  leadId: string,
  rexContactId: string,
  rexLeadId: string
): Promise<void> {
  if (hasDb()) {
    await q(
      `UPDATE leads SET rex_contact_id = $3, rex_lead_id = $4
         WHERE id = $2 AND user_id = $1`,
      [userId, leadId, rexContactId, rexLeadId]
    );
    return;
  }
  const all = await readAllFile();
  const idx = all.findIndex((l) => l.id === leadId && l.userId === userId);
  if (idx === -1) return;
  all[idx] = { ...all[idx], rexContactId, rexLeadId };
  await writeAllFile(all);
}

// Cross-user lookup by Rex's own contact id — the webhook receiver only
// knows Rex's ids, not which agent/brand a lead belongs to.
export async function findLeadByRexContactId(
  rexContactId: string
): Promise<(Lead & { userId: string }) | undefined> {
  if (hasDb()) {
    const rows = await q<LeadRow>(
      "SELECT * FROM leads WHERE rex_contact_id = $1 LIMIT 1",
      [rexContactId]
    );
    return rows[0] ? { ...fromRow(rows[0]), userId: rows[0].user_id } : undefined;
  }
  return (await readAllFile()).find((l) => l.rexContactId === rexContactId);
}

// ── Archive & snooze ───────────────────────────────────────────────────────

// Archive (or unarchive) a batch of an agent's leads. Archiving files them
// away without deleting anything; unarchiving clears any pending resurface
// date too (bringing a lead back manually cancels the scheduled comeback).
export async function setLeadsArchived(
  userId: string,
  leadIds: string[],
  archived: boolean
): Promise<number> {
  if (leadIds.length === 0) return 0;
  const now = new Date().toISOString();
  if (hasDb()) {
    const rows = await q<{ id: string }>(
      archived
        ? `UPDATE leads SET archived_at = $3
             WHERE user_id = $1 AND id = ANY($2) RETURNING id`
        : `UPDATE leads SET archived_at = NULL, resurface_at = NULL
             WHERE user_id = $1 AND id = ANY($2) RETURNING id`,
      archived ? [userId, leadIds, now] : [userId, leadIds]
    );
    return rows.length;
  }
  const all = await readAllFile();
  let n = 0;
  const ids = new Set(leadIds);
  for (let i = 0; i < all.length; i++) {
    if (all[i].userId !== userId || !ids.has(all[i].id)) continue;
    all[i] = archived
      ? { ...all[i], archivedAt: now }
      : { ...all[i], archivedAt: null, resurfaceAt: null };
    n++;
  }
  if (n > 0) await writeAllFile(all);
  return n;
}

// Permanently remove a batch of an agent's leads. Only used by the admin
// over-capture cleanup — normal flows archive rather than delete. Scoped to
// the owner so a stray id can't touch someone else's data.
export async function deleteLeads(
  userId: string,
  leadIds: string[]
): Promise<number> {
  if (leadIds.length === 0) return 0;
  if (hasDb()) {
    const rows = await q<{ id: string }>(
      "DELETE FROM leads WHERE user_id = $1 AND id = ANY($2) RETURNING id",
      [userId, leadIds]
    );
    return rows.length;
  }
  const all = await readAllFile();
  const ids = new Set(leadIds);
  const kept = all.filter((l) => !(l.userId === userId && ids.has(l.id)));
  const removed = all.length - kept.length;
  if (removed > 0) await writeAllFile(kept);
  return removed;
}

// "Save for a later date": archive the lead with a comeback date. The
// timeline records why and when so the story is there when it resurfaces.
export async function snoozeLead(
  userId: string,
  leadId: string,
  until: string,
  reason: string
): Promise<Lead | undefined> {
  const untilIso = new Date(until).toISOString();
  const now = new Date().toISOString();
  const label = `Saved for later — ${reason}. Coming back ${new Date(
    untilIso
  ).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
  const entry = { stage: "nurture" as LeadStage, at: now, label };
  if (hasDb()) {
    const rows = await q<LeadRow>(
      `UPDATE leads
          SET archived_at = $3, resurface_at = $4, stage = 'nurture',
              history = history || $5::jsonb
        WHERE id = $2 AND user_id = $1 RETURNING *`,
      [userId, leadId, now, untilIso, JSON.stringify([entry])]
    );
    return rows[0] ? fromRow(rows[0]) : undefined;
  }
  const all = await readAllFile();
  const idx = all.findIndex((l) => l.id === leadId && l.userId === userId);
  if (idx === -1) return undefined;
  all[idx] = {
    ...all[idx],
    archivedAt: now,
    resurfaceAt: untilIso,
    stage: "nurture",
    history: [...all[idx].history, entry],
  };
  await writeAllFile(all);
  const { userId: _omit, ...lead } = all[idx];
  return lead;
}

// Bring every due snoozed lead back to life: unarchived, stage "new", with a
// timeline entry saying why it's back. Returns what came back (with owner)
// so the caller can fire the new-lead alert.
export async function resurfaceDueLeads(): Promise<
  (Lead & { userId: string })[]
> {
  const now = new Date().toISOString();
  const entry = {
    stage: "new" as LeadStage,
    at: now,
    label: "Back on — the date they said they'd be ready has arrived",
  };
  if (hasDb()) {
    const rows = await q<LeadRow>(
      `UPDATE leads
          SET archived_at = NULL, resurface_at = NULL, stage = 'new',
              history = history || $1::jsonb
        WHERE resurface_at IS NOT NULL AND resurface_at <= NOW()
        RETURNING *`,
      [JSON.stringify([entry])]
    );
    return rows.map((r) => ({ ...fromRow(r), userId: r.user_id }));
  }
  const all = await readAllFile();
  const due: (Lead & { userId: string })[] = [];
  for (let i = 0; i < all.length; i++) {
    const r = all[i].resurfaceAt;
    if (!r || r > now) continue;
    all[i] = {
      ...all[i],
      archivedAt: null,
      resurfaceAt: null,
      stage: "new",
      history: [...all[i].history, entry],
    };
    due.push(all[i]);
  }
  if (due.length > 0) await writeAllFile(all);
  return due;
}

// Record the outcome of a CRM duplicate check (or a push that revealed the
// person already existed there).
export async function setLeadCrmMatch(
  userId: string,
  leadId: string,
  match: CrmMatch
): Promise<Lead | undefined> {
  if (hasDb()) {
    const rows = await q<LeadRow>(
      `UPDATE leads SET crm_match = $3::jsonb
         WHERE id = $2 AND user_id = $1 RETURNING *`,
      [userId, leadId, JSON.stringify(match)]
    );
    return rows[0] ? fromRow(rows[0]) : undefined;
  }
  const all = await readAllFile();
  const idx = all.findIndex((l) => l.id === leadId && l.userId === userId);
  if (idx === -1) return undefined;
  all[idx] = { ...all[idx], crmMatch: match };
  await writeAllFile(all);
  const { userId: _omit, ...lead } = all[idx];
  return lead;
}

// Admin aggregate: per-user lead counts + speed-to-lead for the Performance
// tab. speedMs is the avg time from a lead landing to its first contact
// attempt (any stage past "new"); speedSamples is how many leads that's from,
// so brands can be averaged correctly.
export interface UserLeadSummary {
  userId: string;
  total: number;
  converted: number; // converted + pushed
  speedMs: number | null;
  speedSamples: number;
}

// First contact attempt = first history entry whose stage isn't "new".
function firstActionDelta(
  receivedAt: string | Date,
  history: unknown
): number | null {
  const hist = Array.isArray(history)
    ? (history as { stage: string; at: string }[])
    : [];
  const first = hist.find((h) => h.stage !== "new");
  if (!first) return null;
  const delta =
    new Date(first.at).getTime() - new Date(receivedAt).getTime();
  return delta >= 0 ? delta : null;
}

export async function summariseLeadsByUser(): Promise<UserLeadSummary[]> {
  type Row = {
    user_id: string;
    stage: string;
    received_at: string | Date;
    history: unknown;
  };
  let rows: Row[];
  if (hasDb()) {
    rows = await q<Row>(
      "SELECT user_id, stage, received_at, history FROM leads"
    );
  } else {
    rows = (await readAllFile()).map((l) => ({
      user_id: l.userId,
      stage: l.stage,
      received_at: l.receivedAt,
      history: l.history,
    }));
  }

  const acc = new Map<
    string,
    { total: number; converted: number; speedSum: number; speedN: number }
  >();
  for (const r of rows) {
    const s =
      acc.get(r.user_id) ??
      { total: 0, converted: 0, speedSum: 0, speedN: 0 };
    s.total++;
    if (r.stage === "converted" || r.stage === "pushed") s.converted++;
    const delta = firstActionDelta(r.received_at, r.history);
    if (delta !== null) {
      s.speedSum += delta;
      s.speedN++;
    }
    acc.set(r.user_id, s);
  }
  return [...acc.entries()].map(([userId, s]) => ({
    userId,
    total: s.total,
    converted: s.converted,
    speedMs: s.speedN > 0 ? s.speedSum / s.speedN : null,
    speedSamples: s.speedN,
  }));
}
