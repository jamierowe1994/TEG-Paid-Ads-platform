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

-- "I've forgotten my password" asks from the login page. Keyed by email so a
-- repeat ask refreshes the existing row rather than piling up. The team clears
-- one by issuing a temporary password from the agent's profile.
CREATE TABLE IF NOT EXISTS password_requests (
  email      TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  handled_at TIMESTAMPTZ
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

CREATE TABLE IF NOT EXISTS referrals (
  id            TEXT PRIMARY KEY,
  from_user_id  TEXT NOT NULL,
  from_name     TEXT NOT NULL DEFAULT '',
  from_brand_id TEXT NOT NULL,
  to_brand_id   TEXT NOT NULL,
  lead_name     TEXT NOT NULL DEFAULT '',
  lead_phone    TEXT NOT NULL DEFAULT '',
  lead_email    TEXT NOT NULL DEFAULT '',
  note          TEXT NOT NULL DEFAULT '',
  fee_amount    NUMERIC NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'pending',
  stage         TEXT NOT NULL DEFAULT 'new',
  due_date      TEXT,
  lead_id       TEXT,
  activity      JSONB NOT NULL DEFAULT '[]',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS referrals_from_idx ON referrals(from_user_id);
CREATE INDEX IF NOT EXISTS referrals_to_idx ON referrals(to_brand_id);

CREATE TABLE IF NOT EXISTS brand_meta (
  brand_id      TEXT PRIMARY KEY,
  ad_account_id TEXT,
  page_id       TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE brand_meta ADD COLUMN IF NOT EXISTS linkedin_ad_account TEXT;

-- Single-row store for the LinkedIn OAuth token (one app/token for the group).
-- The single system mailbox (leads@theexpertsgroup.co.uk). One row, id = 1.
-- Connected once by a super admin via Microsoft OAuth; everything the
-- platform sends on its own behalf — invites, password resets, admin alerts —
-- goes out from here rather than from an agent's mailbox.
-- One-time links for password resets and invites. The raw token is NEVER
-- stored: only its SHA-256, so a database leak can't be used to log in as
-- anybody. purpose keeps a reset link from being reused as an invite.
CREATE TABLE IF NOT EXISTS push_config (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS push_subs (
  endpoint TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  sub JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS auth_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  purpose TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_tokens_user_idx ON auth_tokens(user_id);
CREATE TABLE IF NOT EXISTS system_mailbox (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  connected_by TEXT
);
CREATE TABLE IF NOT EXISTS linkedin_token (
  id            INT PRIMARY KEY DEFAULT 1,
  access_token  TEXT,
  refresh_token TEXT,
  expires_at    TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Columns added after first release (safe to re-run)
ALTER TABLE users ADD COLUMN IF NOT EXISTS meta_campaign_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_stage TEXT DEFAULT 'signed_up';
ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_notes JSONB DEFAULT '[]';
ALTER TABLE users ADD COLUMN IF NOT EXISTS campaign_approved BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS campaign_feedback JSONB NOT NULL DEFAULT '[]';
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mobile_seen_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS desktop_seen_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS app_seen_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS launch_list_extra (
  email TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  brand_id TEXT NOT NULL,
  added_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS magnet_map (
  brand_id TEXT NOT NULL,
  ad_key TEXT NOT NULL,
  magnet_id TEXT NOT NULL,
  PRIMARY KEY (brand_id, ad_key)
);
CREATE TABLE IF NOT EXISTS lead_magnets (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL,
  title TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  bytes BYTEA NOT NULL,
  uploaded_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS campaign_assets JSONB NOT NULL DEFAULT '[]';
ALTER TABLE users ADD COLUMN IF NOT EXISTS rex_user_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS rex_account_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ms_email TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ms_connected_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ms_refresh_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS cancel_requested_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS microsite_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_type TEXT DEFAULT 'paid';
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_reset_password BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;
-- Stripe. The subscription is two lines: a flat management fee plus the ad
-- spend for the chosen tier. The paid flag is owned by the webhook, never
-- by the signup route. commitment_ends_at is the 3-month minimum term —
-- Stripe has no native concept of a minimum term, so we record it and gate
-- self-serve cancellation on it.
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS commitment_ends_at TIMESTAMPTZ;
-- When the current subscription period ends: the real renewal date from
-- Stripe, rather than guessing a monthly anniversary of the signup date.
ALTER TABLE users ADD COLUMN IF NOT EXISTS renews_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS users_stripe_customer_idx ON users(stripe_customer_id);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS referral_id TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS notes JSONB NOT NULL DEFAULT '[]';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS appointment_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS meta_lead_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS leads_user_meta_lead_uq
  ON leads(user_id, meta_lead_id) WHERE meta_lead_id IS NOT NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS rex_contact_id TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS rex_lead_id TEXT;
CREATE INDEX IF NOT EXISTS leads_rex_contact_idx ON leads(rex_contact_id);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS resurface_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS crm_match JSONB;
-- The Meta campaign a lead came from (from the leadgen import). Lets us scope
-- a lead to the agent's tagged campaign and spot cross-campaign over-capture.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS campaign_id TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ad_name TEXT;
-- When this lead should come back into the Follow-ups box. Set a day ahead
-- each time a contact attempt is logged, or to a date the agent picks as a
-- reminder. Distinct from resurface_at (the nurture/"save for later" snooze):
-- a follow-up hides the lead WITHOUT changing its stage.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS follow_up_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS postcode TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;
CREATE INDEX IF NOT EXISTS leads_follow_up_idx ON leads(follow_up_at)
  WHERE follow_up_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS leads_resurface_idx ON leads(resurface_at)
  WHERE resurface_at IS NOT NULL;

-- Raw capture of every Rex webhook delivery, so we can see real payload
-- shapes before building the stage-mapping logic against them.
CREATE TABLE IF NOT EXISTS rex_webhook_log (
  id          TEXT PRIMARY KEY,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  body        JSONB NOT NULL DEFAULT '{}'
);
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
