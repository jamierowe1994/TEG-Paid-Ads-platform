import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { DATA_DIR } from "./data-dir";
import { hasDb, q } from "./db";

// "Forgot password" asks from the login page. There's no system mailbox yet
// (the only outbound email is an agent's own Microsoft mailbox), so a reset
// link can't be emailed. Instead the ask lands here, the team sees it in the
// admin, and clears it by issuing a temporary password from the agent's
// profile. When info@theexpertsgroup.co.uk is wired up for app-only sending,
// this becomes the trigger for a real self-service reset email.

const FILE = path.join(DATA_DIR, "password-requests.json");

export interface PasswordRequest {
  email: string;
  createdAt: string;
  handledAt: string | null;
}

async function readAllFile(): Promise<PasswordRequest[]> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8")) as PasswordRequest[];
  } catch {
    return [];
  }
}

async function writeAllFile(rows: PasswordRequest[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(rows, null, 2), "utf8");
}

// Record an ask (or refresh an existing one), reopening it if it was handled
// before — they're evidently still locked out.
export async function requestPasswordReset(email: string): Promise<void> {
  const key = email.trim().toLowerCase();
  if (!key) return;
  const now = new Date().toISOString();
  if (hasDb()) {
    await q(
      `INSERT INTO password_requests (email, created_at, handled_at)
       VALUES ($1, $2, NULL)
       ON CONFLICT (email)
       DO UPDATE SET created_at = $2, handled_at = NULL`,
      [key, now]
    );
    return;
  }
  const all = await readAllFile();
  const idx = all.findIndex((r) => r.email === key);
  const row = { email: key, createdAt: now, handledAt: null };
  if (idx === -1) all.push(row);
  else all[idx] = row;
  await writeAllFile(all);
}

// Everything still waiting on the team, newest ask first.
export async function listPendingPasswordRequests(): Promise<PasswordRequest[]> {
  if (hasDb()) {
    const rows = await q<{
      email: string;
      created_at: string | Date;
      handled_at: string | Date | null;
    }>(
      `SELECT * FROM password_requests WHERE handled_at IS NULL
        ORDER BY created_at DESC`
    );
    return rows.map((r) => ({
      email: r.email,
      createdAt: new Date(r.created_at).toISOString(),
      handledAt: null,
    }));
  }
  return (await readAllFile())
    .filter((r) => !r.handledAt)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function markPasswordRequestHandled(email: string): Promise<void> {
  const key = email.trim().toLowerCase();
  const now = new Date().toISOString();
  if (hasDb()) {
    await q(
      "UPDATE password_requests SET handled_at = $2 WHERE email = $1",
      [key, now]
    );
    return;
  }
  const all = await readAllFile();
  const idx = all.findIndex((r) => r.email === key);
  if (idx === -1) return;
  all[idx] = { ...all[idx], handledAt: now };
  await writeAllFile(all);
}
