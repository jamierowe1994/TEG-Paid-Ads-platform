import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { DATA_DIR } from "./data-dir";
import { hasDb, q } from "./db";

// Raw capture of every Rex webhook delivery. We don't yet know Rex's exact
// payload shape for the events that matter (Appraisal created/updated etc.),
// so this just records what arrives — the admin panel shows the last few so
// the real shape can be read and the stage-mapping logic built against it,
// the same way Contacts/describeModel unblocked the contact-creation fix.

const FILE = path.join(DATA_DIR, "rex-webhook-log.json");

export interface RexWebhookEntry {
  id: string;
  receivedAt: string;
  body: unknown;
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

async function readAllFile(): Promise<RexWebhookEntry[]> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8")) as RexWebhookEntry[];
  } catch {
    return [];
  }
}

export async function logRexWebhook(body: unknown): Promise<void> {
  const entry: RexWebhookEntry = {
    id: uid(),
    receivedAt: new Date().toISOString(),
    body,
  };
  if (hasDb()) {
    await q(
      "INSERT INTO rex_webhook_log (id, received_at, body) VALUES ($1,$2,$3)",
      [entry.id, entry.receivedAt, JSON.stringify(body ?? {})]
    );
    return;
  }
  const all = await readAllFile();
  all.unshift(entry);
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(all.slice(0, 50), null, 2), "utf8");
}

export async function listRecentRexWebhooks(
  limit = 10
): Promise<RexWebhookEntry[]> {
  if (hasDb()) {
    const rows = await q<{ id: string; received_at: string; body: unknown }>(
      "SELECT id, received_at, body FROM rex_webhook_log ORDER BY received_at DESC LIMIT $1",
      [limit]
    );
    return rows.map((r) => ({
      id: r.id,
      receivedAt: new Date(r.received_at).toISOString(),
      body: r.body,
    }));
  }
  return (await readAllFile()).slice(0, limit);
}
