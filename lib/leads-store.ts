import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { DATA_DIR } from "./data-dir";
import { hasDb, q } from "./db";
import type { Lead, LeadStage } from "./types";

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

export async function createLead(userId: string, lead: Lead): Promise<void> {
  if (hasDb()) {
    await q(
      `INSERT INTO leads (id, user_id, name, phone, email, source, note, stage, received_at, history, referral_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
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
      ]
    );
    return;
  }
  const all = await readAllFile();
  all.push({ ...lead, userId });
  await writeAllFile(all);
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
export async function updateLeadStage(
  userId: string,
  leadId: string,
  stage: LeadStage
): Promise<Lead | undefined> {
  const entry = { stage, at: new Date().toISOString() };
  if (hasDb()) {
    const rows = await q<LeadRow>(
      `UPDATE leads
         SET stage = $3, history = history || $4::jsonb
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
    history: [...all[idx].history, entry],
  };
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
