import "server-only";
import { Pool } from "pg";

// Postgres connection + schema. Active when DATABASE_URL is set (Railway);
// when it's absent the stores fall back to local JSON files so dev works
// without a database installed.
//
// Railway setup: add a PostgreSQL service to the project, then on the app
// service add the env var  DATABASE_URL = ${{Postgres.DATABASE_URL}}
// (Railway offers this as a variable reference). Nothing else — tables are
// created automatically on first use.

export function hasDb(): boolean {
  return !!process.env.DATABASE_URL;
}

// Cache the pool on globalThis so Next.js dev hot-reloads don't leak
// connections by creating a new pool per reload.
const globalForDb = globalThis as unknown as {
  __tegPool?: Pool;
  __tegSchemaReady?: Promise<void>;
};

function needsSsl(url: string): boolean {
  // Railway's internal network and local Postgres don't use SSL; the public
  // proxy (and most other hosted Postgres) does.
  return !/railway\.internal|localhost|127\.0\.0\.1/.test(url);
}

function getPool(): Pool {
  if (!globalForDb.__tegPool) {
    const url = process.env.DATABASE_URL!;
    globalForDb.__tegPool = new Pool({
      connectionString: url,
      max: 5,
      ssl: needsSsl(url) ? { rejectUnauthorized: false } : undefined,
    });
  }
  return globalForDb.__tegPool;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL DEFAULT '',
  email         TEXT NOT NULL UNIQUE,
  mobile        TEXT NOT NULL DEFAULT '',
  photo         TEXT,
  brand_id      TEXT NOT NULL,
  platforms     JSONB NOT NULL DEFAULT '[]',
  goal          TEXT NOT NULL DEFAULT '',
  package_id    TEXT NOT NULL DEFAULT 'starter',
  paid          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  password_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS feedback (
  id         TEXT PRIMARY KEY,
  note       TEXT NOT NULL,
  page       TEXT NOT NULL DEFAULT '',
  email      TEXT,
  screenshot TEXT,
  user_agent TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS signup_events (
  email      TEXT PRIMARY KEY,
  name       TEXT NOT NULL DEFAULT '',
  brand_id   TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS leads (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL DEFAULT '',
  phone       TEXT NOT NULL DEFAULT '',
  email       TEXT NOT NULL DEFAULT '',
  source      TEXT NOT NULL DEFAULT 'facebook',
  note        TEXT NOT NULL DEFAULT '',
  stage       TEXT NOT NULL DEFAULT 'new',
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  history     JSONB NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS leads_user_idx ON leads(user_id);

-- Columns added after first release (safe to re-run)
ALTER TABLE users ADD COLUMN IF NOT EXISTS meta_campaign_id TEXT;
`;

async function ensureSchema(): Promise<void> {
  if (!globalForDb.__tegSchemaReady) {
    globalForDb.__tegSchemaReady = getPool()
      .query(SCHEMA)
      .then(() => undefined)
      .catch((err) => {
        // Allow a retry on the next request rather than caching the failure.
        globalForDb.__tegSchemaReady = undefined;
        throw err;
      });
  }
  return globalForDb.__tegSchemaReady;
}

// Query helper: guarantees the schema exists before the first real query.
export async function q<Row = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<Row[]> {
  await ensureSchema();
  const result = await getPool().query(text, params as never[]);
  return result.rows as Row[];
}
