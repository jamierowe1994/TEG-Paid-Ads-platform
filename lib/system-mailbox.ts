import "server-only";
import { hasDb, q } from "./db";
import { promises as fs } from "fs";
import path from "path";
import { DATA_DIR } from "./data-dir";

/* The single system mailbox — leads@theexpertsgroup.co.uk.
 *
 * A super admin connects it once via Microsoft OAuth, and everything the
 * platform sends on its OWN behalf goes out from here: invite emails,
 * password resets, admin notifications. That's deliberately separate from the
 * per-agent connection, which exists so lead emails come from the agent's own
 * address — those two must not share a token.
 *
 * One row, id = 1. Mirrors the linkedin_token store, including the JSON
 * fallback so local dev works without Postgres.
 */

export interface SystemMailbox {
  email: string;
  refreshToken: string;
  connectedAt: string;
  connectedBy?: string | null;
}

const FILE = path.join(DATA_DIR, "system-mailbox.json");

interface Row {
  email: string;
  refresh_token: string;
  connected_at: string | Date;
  connected_by: string | null;
}

export async function getSystemMailbox(): Promise<SystemMailbox | null> {
  if (hasDb()) {
    const rows = await q<Row>(
      "SELECT email, refresh_token, connected_at, connected_by FROM system_mailbox WHERE id = 1"
    );
    const r = rows[0];
    if (!r) return null;
    return {
      email: r.email,
      refreshToken: r.refresh_token,
      connectedAt: new Date(r.connected_at).toISOString(),
      connectedBy: r.connected_by,
    };
  }
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8")) as SystemMailbox;
  } catch {
    return null;
  }
}

export async function setSystemMailbox(m: SystemMailbox): Promise<void> {
  if (hasDb()) {
    await q(
      `INSERT INTO system_mailbox (id, email, refresh_token, connected_at, connected_by)
       VALUES (1, $1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET
         email = EXCLUDED.email,
         refresh_token = EXCLUDED.refresh_token,
         connected_at = EXCLUDED.connected_at,
         connected_by = EXCLUDED.connected_by`,
      [m.email, m.refreshToken, m.connectedAt, m.connectedBy ?? null]
    );
    return;
  }
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(m, null, 2), "utf8");
}

export async function clearSystemMailbox(): Promise<void> {
  if (hasDb()) {
    await q("DELETE FROM system_mailbox WHERE id = 1");
    return;
  }
  await fs.rm(FILE, { force: true });
}

/** Safe to show in the admin UI — never includes the refresh token. */
export async function systemMailboxStatus(): Promise<{
  connected: boolean;
  email?: string;
  connectedAt?: string;
  connectedBy?: string | null;
}> {
  const m = await getSystemMailbox();
  if (!m) return { connected: false };
  return {
    connected: true,
    email: m.email,
    connectedAt: m.connectedAt,
    connectedBy: m.connectedBy,
  };
}
