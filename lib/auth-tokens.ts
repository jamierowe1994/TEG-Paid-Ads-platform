import "server-only";
import crypto from "crypto";
import { hasDb, q } from "./db";
import { promises as fs } from "fs";
import path from "path";
import { DATA_DIR } from "./data-dir";

/* One-time links for password resets and invites.
 *
 * The raw token is never stored — only its SHA-256. A leak of the database
 * therefore can't be turned into a working login link for anybody.
 *
 * `purpose` is checked on redemption so a reset link can't be replayed as an
 * invite (or vice versa), and every token is single-use.
 */

// "admin-invite" links an admin_users row (not an agent) — same table, the
// user_id column just holds that id instead.
export type TokenPurpose = "reset" | "invite" | "admin-invite";

const FILE = path.join(DATA_DIR, "auth-tokens.json");

function hash(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

interface StoredToken {
  tokenHash: string;
  userId: string;
  purpose: TokenPurpose;
  expiresAt: string;
  usedAt?: string | null;
}

async function readFile(): Promise<StoredToken[]> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8")) as StoredToken[];
  } catch {
    return [];
  }
}
async function writeFile(all: StoredToken[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(all, null, 2), "utf8");
}

export async function createAuthToken(
  userId: string,
  purpose: TokenPurpose,
  ttlMs: number
): Promise<string> {
  const raw = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();

  if (hasDb()) {
    // Any older link of the same kind stops working the moment a new one is
    // issued — otherwise "resend" quietly leaves several live keys about.
    await q("DELETE FROM auth_tokens WHERE user_id = $1 AND purpose = $2", [
      userId,
      purpose,
    ]);
    await q(
      "INSERT INTO auth_tokens (token_hash, user_id, purpose, expires_at) VALUES ($1,$2,$3,$4)",
      [hash(raw), userId, purpose, expiresAt]
    );
    return raw;
  }

  const all = (await readFile()).filter(
    (t) => !(t.userId === userId && t.purpose === purpose)
  );
  all.push({ tokenHash: hash(raw), userId, purpose, expiresAt, usedAt: null });
  await writeFile(all);
  return raw;
}

/** Validate and burn a token. Returns the user id, or null if it's no good. */
export async function consumeAuthToken(
  raw: string,
  purpose: TokenPurpose
): Promise<string | null> {
  const h = hash(raw);

  if (hasDb()) {
    // Single statement so two simultaneous redemptions can't both win.
    const rows = await q<{ user_id: string }>(
      `UPDATE auth_tokens SET used_at = now()
         WHERE token_hash = $1 AND purpose = $2
           AND used_at IS NULL AND expires_at > now()
       RETURNING user_id`,
      [h, purpose]
    );
    return rows[0]?.user_id ?? null;
  }

  const all = await readFile();
  const t = all.find((x) => x.tokenHash === h && x.purpose === purpose);
  if (!t || t.usedAt || new Date(t.expiresAt).getTime() < Date.now()) return null;
  t.usedAt = new Date().toISOString();
  await writeFile(all);
  return t.userId;
}

/** Check a token without burning it — so the reset page can show a form. */
export async function peekAuthToken(
  raw: string,
  purpose: TokenPurpose
): Promise<string | null> {
  const h = hash(raw);
  if (hasDb()) {
    const rows = await q<{ user_id: string }>(
      `SELECT user_id FROM auth_tokens
         WHERE token_hash = $1 AND purpose = $2
           AND used_at IS NULL AND expires_at > now()`,
      [h, purpose]
    );
    return rows[0]?.user_id ?? null;
  }
  const all = await readFile();
  const t = all.find((x) => x.tokenHash === h && x.purpose === purpose);
  if (!t || t.usedAt || new Date(t.expiresAt).getTime() < Date.now()) return null;
  return t.userId;
}
