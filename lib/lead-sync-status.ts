import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { DATA_DIR } from "./data-dir";
import { hasDb, q } from "./db";

// Each brand's last lead-sync result, persisted. The sync loop used to keep
// this only in memory, so a restart wiped it and a brand could fail on every
// run for weeks without anyone seeing (TPE, Oct-Nov 2026). Postgres in
// production; a JSON file in local dev, like the other stores.

export interface LeadSyncStatus {
  brandId: string;
  lastRunAt: string;
  lastOkAt: string | null;
  failingSince: string | null;
  failCount: number; // consecutive failed runs
  error: string | null;
  errorCode: number | null;
  forms: number;
  imported: number;
  alertedAt: string | null;
}

export interface RunOutcome {
  brandId: string;
  forms: number;
  imported: number;
  error?: string;
  errorCode?: number;
}

const FILE = path.join(DATA_DIR, "lead-sync-status.json");

interface Row {
  brand_id: string;
  last_run_at: Date;
  last_ok_at: Date | null;
  failing_since: Date | null;
  fail_count: number;
  error: string | null;
  error_code: number | null;
  forms: number;
  imported: number;
  alerted_at: Date | null;
}

const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null);

function fromRow(r: Row): LeadSyncStatus {
  return {
    brandId: r.brand_id,
    lastRunAt: iso(r.last_run_at)!,
    lastOkAt: iso(r.last_ok_at),
    failingSince: iso(r.failing_since),
    failCount: r.fail_count,
    error: r.error,
    errorCode: r.error_code,
    forms: r.forms,
    imported: r.imported,
    alertedAt: iso(r.alerted_at),
  };
}

async function readFile(): Promise<Record<string, LeadSyncStatus>> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8"));
  } catch {
    return {};
  }
}

async function writeFile(map: Record<string, LeadSyncStatus>): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(map, null, 2), "utf8");
}

export async function getLeadSyncStatuses(): Promise<
  Record<string, LeadSyncStatus>
> {
  if (!hasDb()) return readFile();
  const rows = await q<Row>("SELECT * FROM lead_sync_status");
  const map: Record<string, LeadSyncStatus> = {};
  for (const r of rows) map[r.brand_id] = fromRow(r);
  return map;
}

// Record one brand's run and return its updated status. Success resets the
// streak (and the alert, so the next failure alerts again); failure extends
// it, keeping the date it started.
export async function recordLeadSyncRun(
  o: RunOutcome
): Promise<LeadSyncStatus> {
  if (hasDb()) {
    const rows = o.error
      ? await q<Row>(
          `INSERT INTO lead_sync_status
             (brand_id, last_run_at, failing_since, fail_count, error, error_code)
           VALUES ($1, NOW(), NOW(), 1, $2, $3)
           ON CONFLICT (brand_id) DO UPDATE SET
             last_run_at   = NOW(),
             failing_since = COALESCE(lead_sync_status.failing_since, NOW()),
             fail_count    = lead_sync_status.fail_count + 1,
             error         = $2,
             error_code    = $3
           RETURNING *`,
          [o.brandId, o.error, o.errorCode ?? null]
        )
      : await q<Row>(
          `INSERT INTO lead_sync_status
             (brand_id, last_run_at, last_ok_at, forms, imported)
           VALUES ($1, NOW(), NOW(), $2, $3)
           ON CONFLICT (brand_id) DO UPDATE SET
             last_run_at   = NOW(),
             last_ok_at    = NOW(),
             failing_since = NULL,
             fail_count    = 0,
             error         = NULL,
             error_code    = NULL,
             forms         = $2,
             imported      = $3,
             alerted_at    = NULL
           RETURNING *`,
          [o.brandId, o.forms, o.imported]
        );
    return fromRow(rows[0]);
  }
  const map = await readFile();
  const prev = map[o.brandId];
  const now = new Date().toISOString();
  const next: LeadSyncStatus = o.error
    ? {
        brandId: o.brandId,
        lastRunAt: now,
        lastOkAt: prev?.lastOkAt ?? null,
        failingSince: prev?.failingSince ?? now,
        failCount: (prev?.failCount ?? 0) + 1,
        error: o.error,
        errorCode: o.errorCode ?? null,
        forms: prev?.forms ?? 0,
        imported: prev?.imported ?? 0,
        alertedAt: prev?.alertedAt ?? null,
      }
    : {
        brandId: o.brandId,
        lastRunAt: now,
        lastOkAt: now,
        failingSince: null,
        failCount: 0,
        error: null,
        errorCode: null,
        forms: o.forms,
        imported: o.imported,
        alertedAt: null,
      };
  map[o.brandId] = next;
  await writeFile(map);
  return next;
}

// Claim the right to alert about this brand's current failing streak.
// Atomic in Postgres, so two overlapping runs can't both send.
export async function claimLeadSyncAlert(brandId: string): Promise<boolean> {
  if (hasDb()) {
    const rows = await q(
      `UPDATE lead_sync_status SET alerted_at = NOW()
       WHERE brand_id = $1 AND alerted_at IS NULL AND failing_since IS NOT NULL
       RETURNING brand_id`,
      [brandId]
    );
    return rows.length > 0;
  }
  const map = await readFile();
  const s = map[brandId];
  if (!s || s.alertedAt || !s.failingSince) return false;
  s.alertedAt = new Date().toISOString();
  await writeFile(map);
  return true;
}

// Give the claim back when the alert couldn't be sent, so the next run retries.
export async function releaseLeadSyncAlert(brandId: string): Promise<void> {
  if (hasDb()) {
    await q("UPDATE lead_sync_status SET alerted_at = NULL WHERE brand_id = $1", [
      brandId,
    ]);
    return;
  }
  const map = await readFile();
  if (map[brandId]) {
    map[brandId].alertedAt = null;
    await writeFile(map);
  }
}

// Forget a brand's history: its Page was removed or replaced, so the old
// result describes a Page that's no longer in use.
export async function clearLeadSyncStatus(brandIds: string[]): Promise<void> {
  if (brandIds.length === 0) return;
  if (hasDb()) {
    await q("DELETE FROM lead_sync_status WHERE brand_id = ANY($1)", [brandIds]);
    return;
  }
  const map = await readFile();
  let changed = false;
  for (const id of brandIds) {
    if (map[id]) {
      delete map[id];
      changed = true;
    }
  }
  if (changed) await writeFile(map);
}
