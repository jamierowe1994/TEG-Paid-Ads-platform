import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { DATA_DIR } from "./data-dir";
import { hasDb, q } from "./db";

// Signup-start events (drop-off tracking) — Postgres on Railway, JSON locally.
// One record per email; first start time wins, details refresh.

export interface SignupEvent {
  email: string;
  name: string;
  brandId: string | null;
  startedAt: string;
}

const FILE = path.join(DATA_DIR, "signup-events.json");

interface EventRow {
  email: string;
  name: string;
  brand_id: string | null;
  started_at: string | Date;
}

function fromRow(row: EventRow): SignupEvent {
  return {
    email: row.email,
    name: row.name,
    brandId: row.brand_id,
    startedAt: new Date(row.started_at).toISOString(),
  };
}

async function readAllFile(): Promise<SignupEvent[]> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8")) as SignupEvent[];
  } catch {
    return [];
  }
}

export async function recordSignupStart(event: SignupEvent): Promise<void> {
  if (hasDb()) {
    await q(
      `INSERT INTO signup_events (email, name, brand_id, started_at)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (email)
       DO UPDATE SET name = EXCLUDED.name, brand_id = EXCLUDED.brand_id`,
      [event.email, event.name, event.brandId, event.startedAt]
    );
    return;
  }
  const all = await readAllFile();
  const existing = all.findIndex((e) => e.email === event.email);
  if (existing >= 0) {
    all[existing] = { ...event, startedAt: all[existing].startedAt };
  } else {
    all.push(event);
  }
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(all, null, 2), "utf8");
}

export async function listSignupStarts(): Promise<SignupEvent[]> {
  if (hasDb()) {
    const rows = await q<EventRow>(
      "SELECT * FROM signup_events ORDER BY started_at DESC"
    );
    return rows.map(fromRow);
  }
  return readAllFile();
}
