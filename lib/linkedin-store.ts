import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { DATA_DIR } from "./data-dir";
import { hasDb, q } from "./db";

// Stores the single LinkedIn OAuth token (access + refresh + expiry). One
// token for the group, obtained via the admin "Connect LinkedIn" flow and
// auto-refreshed by lib/linkedin.ts.

export interface LinkedInToken {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null; // ISO
}

const FILE = path.join(DATA_DIR, "linkedin-token.json");

export async function getLinkedInToken(): Promise<LinkedInToken | null> {
  if (hasDb()) {
    const rows = await q<{
      access_token: string | null;
      refresh_token: string | null;
      expires_at: string | Date | null;
    }>("SELECT access_token, refresh_token, expires_at FROM linkedin_token WHERE id = 1");
    const r = rows[0];
    if (!r?.access_token) return null;
    return {
      accessToken: r.access_token,
      refreshToken: r.refresh_token,
      expiresAt: r.expires_at ? new Date(r.expires_at).toISOString() : null,
    };
  }
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8")) as LinkedInToken;
  } catch {
    return null;
  }
}

export async function setLinkedInToken(t: LinkedInToken): Promise<void> {
  if (hasDb()) {
    await q(
      `INSERT INTO linkedin_token (id, access_token, refresh_token, expires_at, updated_at)
       VALUES (1,$1,$2,$3,NOW())
       ON CONFLICT (id)
       DO UPDATE SET access_token = $1, refresh_token = $2, expires_at = $3, updated_at = NOW()`,
      [t.accessToken, t.refreshToken, t.expiresAt]
    );
    return;
  }
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(t, null, 2), "utf8");
}
