import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { DATA_DIR } from "./data-dir";
import { hasDb, q } from "./db";
import type { UserProfile } from "./types";

// Server-side user store, dual backend:
//  - Postgres when DATABASE_URL is set (Railway) — the real store.
//  - Local JSON file otherwise, so dev works without a database.
// Function signatures are the contract; the rest of the app doesn't know or
// care which backend is live.

const FILE = path.join(DATA_DIR, "users.json");

// Stored record = public profile + secrets that must NEVER reach a client:
// the password hash and the Microsoft refresh token.
export interface StoredUser extends UserProfile {
  passwordHash: string;
  msRefreshToken?: string | null;
}

// Agent-facing: strip the secrets AND internal admin notes.
export function toPublic(user: StoredUser): UserProfile {
  const { passwordHash: _pw, msRefreshToken: _ms, adminNotes: _notes, ...pub } = user;
  return pub;
}

// Admin-facing: strip only the secrets (keeps notes, location, stage).
export function toAdmin(user: StoredUser): UserProfile {
  const { passwordHash: _pw, msRefreshToken: _ms, ...rest } = user;
  return rest;
}

// ── Postgres row mapping ─────────────────────────────────────────────────
interface UserRow {
  id: string;
  name: string;
  email: string;
  mobile: string;
  photo: string | null;
  brand_id: string;
  platforms: unknown;
  goal: string;
  package_id: string;
  paid: boolean;
  created_at: string | Date;
  password_hash: string;
  meta_campaign_id: string | null;
  rex_user_id: string | null;
  rex_account_id: string | null;
  ms_email: string | null;
  last_seen_at: string | Date | null;
  mobile_seen_at: string | Date | null;
  desktop_seen_at: string | Date | null;
  app_seen_at: string | Date | null;
  ms_connected_at: string | Date | null;
  ms_refresh_token: string | null;
  cancel_requested_at: string | Date | null;
  location: string | null;
  onboarding_stage: string | null;
  admin_notes: unknown;
  campaign_approved: boolean | null;
  campaign_feedback: unknown;
  campaign_assets: unknown;
  microsite_url: string | null;
  account_type: string | null;
  must_reset_password: boolean | null;
  deactivated_at: string | Date | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string | null;
  commitment_ends_at: string | Date | null;
  renews_at: string | Date | null;
}

function fromRow(row: UserRow): StoredUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    mobile: row.mobile,
    photo: row.photo,
    brandId: row.brand_id as StoredUser["brandId"],
    platforms: (Array.isArray(row.platforms)
      ? row.platforms
      : []) as StoredUser["platforms"],
    goal: row.goal,
    packageId: row.package_id as StoredUser["packageId"],
    paid: row.paid,
    createdAt: new Date(row.created_at).toISOString(),
    passwordHash: row.password_hash,
    metaCampaignId: row.meta_campaign_id,
    rexUserId: row.rex_user_id,
    rexAccountId: row.rex_account_id ?? null,
    msEmail: row.ms_email ?? null,
    lastSeenAt: row.last_seen_at ? new Date(row.last_seen_at).toISOString() : null,
    mobileSeenAt: row.mobile_seen_at ? new Date(row.mobile_seen_at).toISOString() : null,
    desktopSeenAt: row.desktop_seen_at ? new Date(row.desktop_seen_at).toISOString() : null,
    appSeenAt: row.app_seen_at ? new Date(row.app_seen_at).toISOString() : null,
    msConnectedAt: row.ms_connected_at
      ? new Date(row.ms_connected_at).toISOString()
      : null,
    msRefreshToken: row.ms_refresh_token ?? null,
    cancelRequestedAt: row.cancel_requested_at
      ? new Date(row.cancel_requested_at).toISOString()
      : null,
    location: row.location,
    onboardingStage:
      (row.onboarding_stage as StoredUser["onboardingStage"]) ?? "signed_up",
    adminNotes: (Array.isArray(row.admin_notes)
      ? row.admin_notes
      : []) as StoredUser["adminNotes"],
    campaignApproved: !!row.campaign_approved,
    campaignFeedback: (Array.isArray(row.campaign_feedback)
      ? row.campaign_feedback
      : []) as StoredUser["campaignFeedback"],
    campaignAssets: (Array.isArray(row.campaign_assets)
      ? row.campaign_assets
      : []) as StoredUser["campaignAssets"],
    micrositeUrl: row.microsite_url ?? null,
    accountType:
      (row.account_type as StoredUser["accountType"]) ?? "paid",
    mustResetPassword: !!row.must_reset_password,
    deactivatedAt: row.deactivated_at
      ? new Date(row.deactivated_at).toISOString()
      : null,
    stripeCustomerId: row.stripe_customer_id ?? null,
    stripeSubscriptionId: row.stripe_subscription_id ?? null,
    subscriptionStatus: row.subscription_status ?? null,
    commitmentEndsAt: row.commitment_ends_at
      ? new Date(row.commitment_ends_at).toISOString()
      : null,
    renewsAt: row.renews_at ? new Date(row.renews_at).toISOString() : null,
  };
}

// ── JSON fallback helpers ────────────────────────────────────────────────
/* Presence: stamp "seen just now", at most once a minute per user per
 * instance. Reads stay reads — this is called fire-and-forget from the two
 * endpoints every live session hits anyway (auth/me, leads list), so an
 * agent's ordinary use of the app IS the heartbeat. Admin-only output. */
const lastTouch = new Map<string, number>();
export type SeenSurface = "mobile" | "desktop" | "app";

export async function touchLastSeen(
  userId: string,
  surface: SeenSurface = "desktop"
): Promise<void> {
  // Throttle per user PER SURFACE: someone on a laptop and a phone at once
  // must stamp both, which a single per-user throttle would swallow.
  const key = `${userId}:${surface}`;
  const prev = lastTouch.get(key) ?? 0;
  if (Date.now() - prev < 60_000) return;
  lastTouch.set(key, Date.now());
  // The installed app is also a mobile session — stamp both so "has a phone
  // session" stays true regardless of how they got there.
  const cols =
    surface === "app"
      ? ["app_seen_at", "mobile_seen_at"]
      : surface === "mobile"
        ? ["mobile_seen_at"]
        : ["desktop_seen_at"];
  try {
    if (hasDb()) {
      const sets = ["last_seen_at = now()", ...cols.map((c) => `${c} = now()`)];
      await q(`UPDATE users SET ${sets.join(", ")} WHERE id = $1`, [userId]);
      return;
    }
    const all = await readAllFile();
    const idx = all.findIndex((u) => u.id === userId);
    if (idx !== -1) {
      const now = new Date().toISOString();
      const patch: Record<string, string> = { lastSeenAt: now };
      if (cols.includes("app_seen_at")) patch.appSeenAt = now;
      if (cols.includes("mobile_seen_at")) patch.mobileSeenAt = now;
      if (cols.includes("desktop_seen_at")) patch.desktopSeenAt = now;
      all[idx] = { ...all[idx], ...patch };
      await writeAllFile(all);
    }
  } catch {
    /* presence is a nicety — never let it surface as an error */
  }
}

async function readAllFile(): Promise<StoredUser[]> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8")) as StoredUser[];
  } catch {
    return [];
  }
}

async function writeAllFile(users: StoredUser[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(users, null, 2), "utf8");
}

// ── Public API ───────────────────────────────────────────────────────────
export async function findByEmail(
  email: string
): Promise<StoredUser | undefined> {
  const needle = email.toLowerCase();
  if (hasDb()) {
    const rows = await q<UserRow>("SELECT * FROM users WHERE email = $1", [
      needle,
    ]);
    return rows[0] ? fromRow(rows[0]) : undefined;
  }
  return (await readAllFile()).find((u) => u.email === needle);
}

/** Look a user up by their Stripe customer id — used by the webhook when an
 *  event has no userId metadata (e.g. a subscription edited in the dashboard).
 *  Indexed on users(stripe_customer_id). */
export async function findByStripeCustomer(
  customerId: string
): Promise<StoredUser | undefined> {
  if (hasDb()) {
    const rows = await q<UserRow>(
      "SELECT * FROM users WHERE stripe_customer_id = $1",
      [customerId]
    );
    return rows[0] ? fromRow(rows[0]) : undefined;
  }
  return (await readAllFile()).find((u) => u.stripeCustomerId === customerId);
}

export async function findById(id: string): Promise<StoredUser | undefined> {
  if (hasDb()) {
    const rows = await q<UserRow>("SELECT * FROM users WHERE id = $1", [id]);
    return rows[0] ? fromRow(rows[0]) : undefined;
  }
  return (await readAllFile()).find((u) => u.id === id);
}

export async function createUser(user: StoredUser): Promise<void> {
  if (hasDb()) {
    await q(
      `INSERT INTO users
         (id, name, email, mobile, photo, brand_id, platforms, goal,
          package_id, paid, created_at, password_hash, meta_campaign_id,
          location, onboarding_stage, admin_notes, account_type,
          must_reset_password)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [
        user.id,
        user.name,
        user.email,
        user.mobile,
        user.photo,
        user.brandId,
        JSON.stringify(user.platforms),
        user.goal,
        user.packageId,
        user.paid,
        user.createdAt,
        user.passwordHash,
        user.metaCampaignId ?? null,
        user.location ?? null,
        user.onboardingStage ?? "signed_up",
        JSON.stringify(user.adminNotes ?? []),
        user.accountType ?? "paid",
        user.mustResetPassword ?? false,
      ]
    );
    return;
  }
  const all = await readAllFile();
  all.push(user);
  await writeAllFile(all);
}

export async function updateUser(
  id: string,
  patch: Partial<StoredUser>
): Promise<StoredUser | undefined> {
  if (hasDb()) {
    const current = await findById(id);
    if (!current) return undefined;
    const next = { ...current, ...patch, id: current.id };
    await q(
      `UPDATE users SET
         name = $2, mobile = $3, photo = $4, brand_id = $5, platforms = $6,
         goal = $7, package_id = $8, paid = $9, password_hash = $10,
         meta_campaign_id = $11, location = $12, onboarding_stage = $13,
         admin_notes = $14, campaign_approved = $15, campaign_feedback = $16,
         campaign_assets = $17, rex_user_id = $18,
         ms_email = $19, ms_connected_at = $20, ms_refresh_token = $21,
         microsite_url = $22, account_type = $23,
         must_reset_password = $24, deactivated_at = $25,
         stripe_customer_id = $26, stripe_subscription_id = $27,
         subscription_status = $28, commitment_ends_at = $29,
         renews_at = $30, rex_account_id = $31,
         mobile_seen_at = $32, desktop_seen_at = $33, app_seen_at = $34
       WHERE id = $1`,
      [
        next.id,
        next.name,
        next.mobile,
        next.photo,
        next.brandId,
        JSON.stringify(next.platforms),
        next.goal,
        next.packageId,
        next.paid,
        next.passwordHash,
        next.metaCampaignId ?? null,
        next.location ?? null,
        next.onboardingStage ?? "signed_up",
        JSON.stringify(next.adminNotes ?? []),
        next.campaignApproved ?? false,
        JSON.stringify(next.campaignFeedback ?? []),
        JSON.stringify(next.campaignAssets ?? []),
        next.rexUserId ?? null,
        next.msEmail ?? null,
        next.msConnectedAt ?? null,
        next.msRefreshToken ?? null,
        next.micrositeUrl ?? null,
        next.accountType ?? "paid",
        next.mustResetPassword ?? false,
        next.deactivatedAt ?? null,
        next.stripeCustomerId ?? null,
        next.stripeSubscriptionId ?? null,
        next.subscriptionStatus ?? null,
        next.commitmentEndsAt ?? null,
        next.renewsAt ?? null,
        next.rexAccountId ?? null,
        next.mobileSeenAt ?? null,
        next.desktopSeenAt ?? null,
        next.appSeenAt ?? null,
      ]
    );
    return next;
  }
  const all = await readAllFile();
  const idx = all.findIndex((u) => u.id === id);
  if (idx === -1) return undefined;
  all[idx] = { ...all[idx], ...patch, id: all[idx].id };
  await writeAllFile(all);
  return all[idx];
}

// ── Microsoft connection (column-scoped writes) ──────────────────────────
// These deliberately bypass updateUser's whole-record read-merge-write: a
// full-row rewrite racing a disconnect can resurrect a "revoked" token.

// Is this mailbox already connected to a DIFFERENT portal user?
export async function findByMsEmail(
  email: string
): Promise<StoredUser | undefined> {
  const needle = email.trim().toLowerCase();
  if (!needle) return undefined;
  if (hasDb()) {
    const rows = await q<UserRow>(
      "SELECT * FROM users WHERE LOWER(ms_email) = $1 LIMIT 1",
      [needle]
    );
    return rows[0] ? fromRow(rows[0]) : undefined;
  }
  return (await readAllFile()).find(
    (u) => (u.msEmail ?? "").toLowerCase() === needle
  );
}

// Set or clear the whole Microsoft connection — touches ONLY the ms_ columns.
export async function setMsConnection(
  userId: string,
  conn: { email: string; connectedAt: string; refreshToken: string } | null
): Promise<void> {
  if (hasDb()) {
    await q(
      `UPDATE users SET ms_email = $2, ms_connected_at = $3, ms_refresh_token = $4
        WHERE id = $1`,
      [
        userId,
        conn?.email ?? null,
        conn?.connectedAt ?? null,
        conn?.refreshToken ?? null,
      ]
    );
    return;
  }
  const all = await readAllFile();
  const idx = all.findIndex((u) => u.id === userId);
  if (idx === -1) return;
  all[idx] = {
    ...all[idx],
    msEmail: conn?.email ?? null,
    msConnectedAt: conn?.connectedAt ?? null,
    msRefreshToken: conn?.refreshToken ?? null,
  };
  await writeAllFile(all);
}

// Compare-and-swap for refresh-token rotation: only persists the new token
// if the stored one is still the one we rotated FROM. A disconnect (NULL) or
// a newer rotation wins — we never resurrect a revoked connection.
export async function rotateMsRefreshToken(
  userId: string,
  oldToken: string,
  newToken: string
): Promise<boolean> {
  if (hasDb()) {
    const rows = await q<{ id: string }>(
      `UPDATE users SET ms_refresh_token = $3
        WHERE id = $1 AND ms_refresh_token = $2 RETURNING id`,
      [userId, oldToken, newToken]
    );
    return rows.length > 0;
  }
  const all = await readAllFile();
  const idx = all.findIndex((u) => u.id === userId);
  if (idx === -1 || all[idx].msRefreshToken !== oldToken) return false;
  all[idx] = { ...all[idx], msRefreshToken: newToken };
  await writeAllFile(all);
  return true;
}

// ── Subscription / account ───────────────────────────────────────────────

// Flag (or clear) a cancellation request — column-scoped so it never clobbers
// a concurrent profile edit. `at = null` resumes the subscription.
export async function setCancelRequested(
  userId: string,
  at: string | null
): Promise<StoredUser | undefined> {
  if (hasDb()) {
    await q("UPDATE users SET cancel_requested_at = $2 WHERE id = $1", [
      userId,
      at,
    ]);
    return findById(userId);
  }
  const all = await readAllFile();
  const idx = all.findIndex((u) => u.id === userId);
  if (idx === -1) return undefined;
  all[idx] = { ...all[idx], cancelRequestedAt: at };
  await writeAllFile(all);
  return all[idx];
}

// Permanently delete an account and everything it owns (leads cascade via the
// FK). Used by the agent's own "delete my account" action.
export async function deleteUser(userId: string): Promise<boolean> {
  if (hasDb()) {
    const rows = await q<{ id: string }>(
      "DELETE FROM users WHERE id = $1 RETURNING id",
      [userId]
    );
    return rows.length > 0;
  }
  const all = await readAllFile();
  const next = all.filter((u) => u.id !== userId);
  if (next.length === all.length) return false;
  await writeAllFile(next);
  return true;
}

// Admin listing — full records (with notes/location/stage), newest first.
export async function listUsers(): Promise<UserProfile[]> {
  if (hasDb()) {
    const rows = await q<UserRow>(
      "SELECT * FROM users ORDER BY created_at DESC"
    );
    return rows.map((r) => toAdmin(fromRow(r)));
  }
  return (await readAllFile())
    .map(toAdmin)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
