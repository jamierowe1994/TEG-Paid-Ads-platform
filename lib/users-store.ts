import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { DATA_DIR } from "./data-dir";
import { hasDb, q } from "./db";
import type { UserProfile } from "./types";

// Server-side user store, dual backend:
//  - Postgres when DATABASE_URL is set (Railway) — the real store.
//  - Local JSON file otherwise, so dev works without a database.
// Function signatures are the contract; the rest of the app doesn't know or
// care which backend is live.

const FILE = path.join(DATA_DIR, "users.json");

// Stored record = public profile + the password hash (never sent to client).
export interface StoredUser extends UserProfile {
  passwordHash: string;
}

// Agent-facing: strip the password hash AND internal admin notes.
export function toPublic(user: StoredUser): UserProfile {
  const { passwordHash: _pw, adminNotes: _notes, ...pub } = user;
  return pub;
}

// Admin-facing: strip only the password hash (keeps notes, location, stage).
export function toAdmin(user: StoredUser): UserProfile {
  const { passwordHash: _pw, ...rest } = user;
  return rest;
}

// ── Postgres row mapping ─────────────────────────────────────────────────
interface UserRow {
  id: string;
  name: string;
  email: string;
  mobile: string;
  photo: string | null;
  brand_id: string;
  platforms: unknown;
  goal: string;
  package_id: string;
  paid: boolean;
  created_at: string | Date;
  password_hash: string;
  meta_campaign_id: string | null;
  location: string | null;
  onboarding_stage: string | null;
  admin_notes: unknown;
  campaign_approved: boolean | null;
  campaign_feedback: unknown;
}

function fromRow(row: UserRow): StoredUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    mobile: row.mobile,
    photo: row.photo,
    brandId: row.brand_id as StoredUser["brandId"],
    platforms: (Array.isArray(row.platforms)
      ? row.platforms
      : []) as StoredUser["platforms"],
    goal: row.goal,
    packageId: row.package_id as StoredUser["packageId"],
    paid: row.paid,
    createdAt: new Date(row.created_at).toISOString(),
    passwordHash: row.password_hash,
    metaCampaignId: row.meta_campaign_id,
    location: row.location,
    onboardingStage:
      (row.onboarding_stage as StoredUser["onboardingStage"]) ?? "signed_up",
    adminNotes: (Array.isArray(row.admin_notes)
      ? row.admin_notes
      : []) as StoredUser["adminNotes"],
    campaignApproved: !!row.campaign_approved,
    campaignFeedback: (Array.isArray(row.campaign_feedback)
      ? row.campaign_feedback
      : []) as StoredUser["campaignFeedback"],
  };
}

// ── JSON fallback helpers ────────────────────────────────────────────────
async function readAllFile(): Promise<StoredUser[]> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8")) as StoredUser[];
  } catch {
    return [];
  }
}

async function writeAllFile(users: StoredUser[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(users, null, 2), "utf8");
}

// ── Public API ───────────────────────────────────────────────────────────
export async function findByEmail(
  email: string
): Promise<StoredUser | undefined> {
  const needle = email.toLowerCase();
  if (hasDb()) {
    const rows = await q<UserRow>("SELECT * FROM users WHERE email = $1", [
      needle,
    ]);
    return rows[0] ? fromRow(rows[0]) : undefined;
  }
  return (await readAllFile()).find((u) => u.email === needle);
}

export async function findById(id: string): Promise<StoredUser | undefined> {
  if (hasDb()) {
    const rows = await q<UserRow>("SELECT * FROM users WHERE id = $1", [id]);
    return rows[0] ? fromRow(rows[0]) : undefined;
  }
  return (await readAllFile()).find((u) => u.id === id);
}

export async function createUser(user: StoredUser): Promise<void> {
  if (hasDb()) {
    await q(
      `INSERT INTO users
         (id, name, email, mobile, photo, brand_id, platforms, goal,
          package_id, paid, created_at, password_hash, meta_campaign_id,
          location, onboarding_stage, admin_notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        user.id,
        user.name,
        user.email,
        user.mobile,
        user.photo,
        user.brandId,
        JSON.stringify(user.platforms),
        user.goal,
        user.packageId,
        user.paid,
        user.createdAt,
        user.passwordHash,
        user.metaCampaignId ?? null,
        user.location ?? null,
        user.onboardingStage ?? "signed_up",
        JSON.stringify(user.adminNotes ?? []),
      ]
    );
    return;
  }
  const all = await readAllFile();
  all.push(user);
  await writeAllFile(all);
}

export async function updateUser(
  id: string,
  patch: Partial<StoredUser>
): Promise<StoredUser | undefined> {
  if (hasDb()) {
    const current = await findById(id);
    if (!current) return undefined;
    const next = { ...current, ...patch, id: current.id };
    await q(
      `UPDATE users SET
         name = $2, mobile = $3, photo = $4, brand_id = $5, platforms = $6,
         goal = $7, package_id = $8, paid = $9, password_hash = $10,
         meta_campaign_id = $11, location = $12, onboarding_stage = $13,
         admin_notes = $14, campaign_approved = $15, campaign_feedback = $16
       WHERE id = $1`,
      [
        next.id,
        next.name,
        next.mobile,
        next.photo,
        next.brandId,
        JSON.stringify(next.platforms),
        next.goal,
        next.packageId,
        next.paid,
        next.passwordHash,
        next.metaCampaignId ?? null,
        next.location ?? null,
        next.onboardingStage ?? "signed_up",
        JSON.stringify(next.adminNotes ?? []),
        next.campaignApproved ?? false,
        JSON.stringify(next.campaignFeedback ?? []),
      ]
    );
    return next;
  }
  const all = await readAllFile();
  const idx = all.findIndex((u) => u.id === id);
  if (idx === -1) return undefined;
  all[idx] = { ...all[idx], ...patch, id: all[idx].id };
  await writeAllFile(all);
  return all[idx];
}

// Admin listing — full records (with notes/location/stage), newest first.
export async function listUsers(): Promise<UserProfile[]> {
  if (hasDb()) {
    const rows = await q<UserRow>(
      "SELECT * FROM users ORDER BY created_at DESC"
    );
    return rows.map((r) => toAdmin(fromRow(r)));
  }
  return (await readAllFile())
    .map(toAdmin)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
