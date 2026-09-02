import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { DATA_DIR } from "./data-dir";
import { hasDb, q } from "./db";
import type { BrandId } from "./brands";

/* Admin-centre accounts that were INVITED rather than hard-coded.
 *
 * Until now every admin was a line in lib/admin-auth.ts and shared a tier
 * password. That was fine for six MDs and James; it is not fine for "add
 * Francesca, and then whoever she brings in". These rows are people with
 * their own password, invited by magic link from the Invite tab.
 *
 * Deliberately never "super". Super carries the raw ADMIN_PASSWORD as its
 * bearer, and the day someone can be *invited* into that is the day the
 * password is one phishing email from public. Brand-scoped roles only.
 */

export type InvitedRole = "md" | "marketing";

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: InvitedRole;
  brandId: BrandId;
  /** Null until they've followed their invite and chosen a password. */
  passwordHash: string | null;
  invitedBy: string | null;
  createdAt: string;
  activatedAt: string | null;
  lastLoginAt: string | null;
}

const FILE = path.join(DATA_DIR, "admin-users.json");

function uid(): string {
  return "adm_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

interface Row {
  id: string;
  email: string;
  name: string;
  role: string;
  brand_id: string;
  password_hash: string | null;
  invited_by: string | null;
  created_at: string | Date;
  activated_at: string | Date | null;
  last_login_at: string | Date | null;
}

const iso = (v: string | Date | null) => (v ? new Date(v).toISOString() : null);

function fromRow(r: Row): AdminUser {
  return {
    id: r.id,
    email: r.email,
    name: r.name,
    role: r.role === "md" ? "md" : "marketing",
    brandId: r.brand_id as BrandId,
    passwordHash: r.password_hash,
    invitedBy: r.invited_by,
    createdAt: new Date(r.created_at).toISOString(),
    activatedAt: iso(r.activated_at),
    lastLoginAt: iso(r.last_login_at),
  };
}

async function readFile(): Promise<AdminUser[]> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8")) as AdminUser[];
  } catch {
    return [];
  }
}
async function writeFile(rows: AdminUser[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(rows, null, 2), "utf8");
}

export async function listAdminUsers(): Promise<AdminUser[]> {
  if (hasDb()) {
    return (await q<Row>("SELECT * FROM admin_users ORDER BY created_at DESC")).map(fromRow);
  }
  return readFile();
}

export async function findAdminUserByEmail(email: string): Promise<AdminUser | null> {
  const needle = email.trim().toLowerCase();
  if (hasDb()) {
    const rows = await q<Row>("SELECT * FROM admin_users WHERE email = $1", [needle]);
    return rows[0] ? fromRow(rows[0]) : null;
  }
  return (await readFile()).find((a) => a.email === needle) ?? null;
}

export async function findAdminUserById(id: string): Promise<AdminUser | null> {
  if (hasDb()) {
    const rows = await q<Row>("SELECT * FROM admin_users WHERE id = $1", [id]);
    return rows[0] ? fromRow(rows[0]) : null;
  }
  return (await readFile()).find((a) => a.id === id) ?? null;
}

/** Create (or refresh) an invited admin. Re-inviting the same email updates
    the name/role/brand and leaves any password they already set alone. */
export async function upsertAdminUser(input: {
  email: string;
  name: string;
  role: InvitedRole;
  brandId: BrandId;
  invitedBy: string | null;
}): Promise<AdminUser> {
  const email = input.email.trim().toLowerCase();
  if (hasDb()) {
    const rows = await q<Row>(
      `INSERT INTO admin_users (id, email, name, role, brand_id, invited_by)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (email) DO UPDATE SET
         name = EXCLUDED.name, role = EXCLUDED.role, brand_id = EXCLUDED.brand_id
       RETURNING *`,
      [uid(), email, input.name, input.role, input.brandId, input.invitedBy]
    );
    return fromRow(rows[0]);
  }
  const all = await readFile();
  const existing = all.find((a) => a.email === email);
  if (existing) {
    existing.name = input.name;
    existing.role = input.role;
    existing.brandId = input.brandId;
    await writeFile(all);
    return existing;
  }
  const row: AdminUser = {
    id: uid(),
    email,
    name: input.name,
    role: input.role,
    brandId: input.brandId,
    passwordHash: null,
    invitedBy: input.invitedBy,
    createdAt: new Date().toISOString(),
    activatedAt: null,
    lastLoginAt: null,
  };
  all.unshift(row);
  await writeFile(all);
  return row;
}

export async function setAdminPassword(id: string, passwordHash: string): Promise<void> {
  if (hasDb()) {
    await q(
      `UPDATE admin_users SET password_hash = $2, activated_at = COALESCE(activated_at, NOW())
        WHERE id = $1`,
      [id, passwordHash]
    );
    return;
  }
  const all = await readFile();
  const hit = all.find((a) => a.id === id);
  if (!hit) return;
  hit.passwordHash = passwordHash;
  hit.activatedAt ??= new Date().toISOString();
  await writeFile(all);
}

export async function touchAdminLogin(id: string): Promise<void> {
  if (hasDb()) {
    await q("UPDATE admin_users SET last_login_at = NOW() WHERE id = $1", [id]);
    return;
  }
  const all = await readFile();
  const hit = all.find((a) => a.id === id);
  if (!hit) return;
  hit.lastLoginAt = new Date().toISOString();
  await writeFile(all);
}

export async function deleteAdminUser(id: string): Promise<void> {
  if (hasDb()) {
    await q("DELETE FROM admin_users WHERE id = $1", [id]);
    return;
  }
  await writeFile((await readFile()).filter((a) => a.id !== id));
}
