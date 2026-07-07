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

// Strip the password hash before anything leaves the server.
export function toPublic(user: StoredUser): UserProfile {
  const { passwordHash: _omit, ...pub } = user;
  return pub;
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
          package_id, paid, created_at, password_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
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
         goal = $7, package_id = $8, paid = $9, password_hash = $10
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

// Admin listing — public profiles only, newest first.
export async function listUsers(): Promise<UserProfile[]> {
  if (hasDb()) {
    const rows = await q<UserRow>(
      "SELECT * FROM users ORDER BY created_at DESC"
    );
    return rows.map((r) => toPublic(fromRow(r)));
  }
  return (await readAllFile())
    .map(toPublic)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
