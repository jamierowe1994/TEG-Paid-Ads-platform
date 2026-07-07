import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { DATA_DIR } from "./data-dir";
import { hasDb, q } from "./db";
import { createLead, uid } from "./leads-store";
import type { Referral, ReferralStatus, LeadStage } from "./types";

// Referrals, server-side — Postgres on Railway, JSON locally. A referral is
// created by one agent and targeted at another business (to_brand_id). When
// someone in that business accepts it, a lead is created in their funnel and
// linked back here, so the referrer can watch its progress and see the fee.

const FILE = path.join(DATA_DIR, "referrals.json");

interface ReferralRow {
  id: string;
  from_user_id: string;
  from_name: string;
  from_brand_id: string;
  to_brand_id: string;
  lead_name: string;
  lead_phone: string;
  lead_email: string;
  note: string;
  fee_amount: string | number;
  status: string;
  stage: string;
  due_date: string | null;
  lead_id: string | null;
  activity: unknown;
  created_at: string | Date;
}

function fromRow(r: ReferralRow): Referral {
  return {
    id: r.id,
    fromUserId: r.from_user_id,
    fromName: r.from_name,
    fromBrandId: r.from_brand_id as Referral["fromBrandId"],
    toBrandId: r.to_brand_id as Referral["toBrandId"],
    leadName: r.lead_name,
    leadPhone: r.lead_phone,
    leadEmail: r.lead_email,
    note: r.note,
    feeAmount: Number(r.fee_amount),
    status: r.status as ReferralStatus,
    stage: r.stage as LeadStage,
    dueDate: r.due_date,
    leadId: r.lead_id,
    createdAt: new Date(r.created_at).toISOString(),
    activity: (Array.isArray(r.activity) ? r.activity : []) as Referral["activity"],
  };
}

async function readAllFile(): Promise<Referral[]> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8")) as Referral[];
  } catch {
    return [];
  }
}

async function writeAllFile(rows: Referral[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(rows, null, 2), "utf8");
}

// ── Create ────────────────────────────────────────────────────────────────
export async function createReferral(
  r: Omit<Referral, "id" | "status" | "stage" | "leadId" | "createdAt" | "activity">
): Promise<Referral> {
  const referral: Referral = {
    ...r,
    id: uid(),
    status: "pending",
    stage: "new",
    leadId: null,
    createdAt: new Date().toISOString(),
    activity: [{ at: new Date().toISOString(), text: "Referral sent" }],
  };
  if (hasDb()) {
    await q(
      `INSERT INTO referrals
        (id, from_user_id, from_name, from_brand_id, to_brand_id, lead_name,
         lead_phone, lead_email, note, fee_amount, status, stage, due_date,
         lead_id, activity, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        referral.id,
        referral.fromUserId,
        referral.fromName,
        referral.fromBrandId,
        referral.toBrandId,
        referral.leadName,
        referral.leadPhone,
        referral.leadEmail,
        referral.note,
        referral.feeAmount,
        referral.status,
        referral.stage,
        referral.dueDate,
        referral.leadId,
        JSON.stringify(referral.activity),
        referral.createdAt,
      ]
    );
  } else {
    const all = await readAllFile();
    all.push(referral);
    await writeAllFile(all);
  }
  return referral;
}

// ── Read ────────────────────────────────────────────────────────────────
export async function getReferral(id: string): Promise<Referral | undefined> {
  if (hasDb()) {
    const rows = await q<ReferralRow>("SELECT * FROM referrals WHERE id = $1", [
      id,
    ]);
    return rows[0] ? fromRow(rows[0]) : undefined;
  }
  return (await readAllFile()).find((r) => r.id === id);
}

// Everything this user can see: referrals they sent, plus referrals sent to
// their business by others. `direction` is tagged for the viewer.
export async function listForUser(
  userId: string,
  brandId: string
): Promise<Referral[]> {
  let rows: Referral[];
  if (hasDb()) {
    const res = await q<ReferralRow>(
      `SELECT * FROM referrals
        WHERE from_user_id = $1 OR to_brand_id = $2
        ORDER BY created_at DESC`,
      [userId, brandId]
    );
    rows = res.map(fromRow);
  } else {
    rows = (await readAllFile())
      .filter((r) => r.fromUserId === userId || r.toBrandId === brandId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  return rows.map((r) => ({
    ...r,
    direction: r.fromUserId === userId ? "sent" : "received",
  }));
}

// ── Update helpers ────────────────────────────────────────────────────────
async function patch(id: string, fields: Partial<Referral>): Promise<Referral | undefined> {
  const current = await getReferral(id);
  if (!current) return undefined;
  const next = { ...current, ...fields, id: current.id };
  if (hasDb()) {
    await q(
      `UPDATE referrals SET
         status = $2, stage = $3, due_date = $4, lead_id = $5, activity = $6
       WHERE id = $1`,
      [
        next.id,
        next.status,
        next.stage,
        next.dueDate,
        next.leadId,
        JSON.stringify(next.activity),
      ]
    );
  } else {
    const all = await readAllFile();
    const idx = all.findIndex((r) => r.id === id);
    if (idx === -1) return undefined;
    all[idx] = next;
    await writeAllFile(all);
  }
  return next;
}

function log(referral: Referral, text: string) {
  return [...referral.activity, { at: new Date().toISOString(), text }];
}

// Recipient accepts — creates a lead in their funnel, linked back here.
export async function acceptReferral(
  id: string,
  recipientUserId: string
): Promise<Referral | undefined> {
  const r = await getReferral(id);
  if (!r || r.status !== "pending") return r;
  const leadId = uid();
  await createLead(recipientUserId, {
    id: leadId,
    name: r.leadName,
    phone: r.leadPhone,
    email: r.leadEmail,
    source: "referral",
    note: r.note
      ? `Referred by ${r.fromName}: ${r.note}`
      : `Referred by ${r.fromName}`,
    stage: "new",
    receivedAt: new Date().toISOString(),
    history: [{ stage: "new", at: new Date().toISOString() }],
    referralId: r.id,
  });
  return patch(id, {
    status: "accepted",
    leadId,
    activity: log(r, "Accepted — added to leads"),
  });
}

export async function declineReferral(id: string): Promise<Referral | undefined> {
  const r = await getReferral(id);
  if (!r) return undefined;
  return patch(id, { status: "declined", activity: log(r, "Declined") });
}

export async function markReferralPaid(id: string): Promise<Referral | undefined> {
  const r = await getReferral(id);
  if (!r) return undefined;
  return patch(id, { status: "paid", activity: log(r, "Fee paid out") });
}

export async function addReferralNote(
  id: string,
  text: string
): Promise<Referral | undefined> {
  const r = await getReferral(id);
  if (!r) return undefined;
  return patch(id, { activity: log(r, text) });
}

// Called when a linked lead changes stage — mirrors progress back to the
// referrer and flips the fee to "owed" when the deal converts.
export async function syncReferralFromLead(
  leadId: string,
  stage: LeadStage
): Promise<void> {
  let target: Referral | undefined;
  if (hasDb()) {
    const rows = await q<ReferralRow>(
      "SELECT * FROM referrals WHERE lead_id = $1",
      [leadId]
    );
    target = rows[0] ? fromRow(rows[0]) : undefined;
  } else {
    target = (await readAllFile()).find((r) => r.leadId === leadId);
  }
  if (!target) return;
  const converted = stage === "converted" || stage === "pushed";
  const status: ReferralStatus =
    converted && target.status === "accepted" ? "converted" : target.status;
  await patch(target.id, {
    stage,
    status,
    activity:
      status === "converted" && target.status !== "converted"
        ? log(target, "Converted — referral fee now due")
        : target.activity,
  });
}

// Pending referrals sent TO this brand by others — drives the Referrals dot.
export async function countPendingForBrand(
  brandId: string,
  excludeUserId: string
): Promise<number> {
  if (hasDb()) {
    const rows = await q<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM referrals
        WHERE to_brand_id = $1 AND from_user_id <> $2 AND status = 'pending'`,
      [brandId, excludeUserId]
    );
    return Number(rows[0]?.n ?? 0);
  }
  return (await readAllFile()).filter(
    (r) =>
      r.toBrandId === brandId &&
      r.fromUserId !== excludeUserId &&
      r.status === "pending"
  ).length;
}
