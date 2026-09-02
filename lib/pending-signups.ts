import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { DATA_DIR } from "./data-dir";
import { hasDb, q } from "./db";
import { findByEmail, createUser, updateUser } from "./users-store";
import type { StoredUser } from "./users-store";
import { brandById } from "./brands";
import { packageById } from "./packages";
import { commitmentEnd } from "./stripe";
import { sendSystemEmail } from "./mailer";
import { newSignupEmail } from "./emails";

/* A signup that hasn't been paid for — and therefore isn't an account.
 *
 * The old order was: create the account, then send them to Stripe, then hope.
 * Three things went wrong with that, all of them real:
 *   · people who abandoned the card page were left holding an account they
 *     couldn't use, and had to be chased or deleted by hand;
 *   · Hayley got a "new signup" email for every one of them, so the one
 *     number she was trying to trust — how many people actually joined —
 *     counted people who never paid;
 *   · "signed up" and "paying customer" stopped meaning the same thing,
 *     which makes every report downstream a guess.
 *
 * So the details wait here instead. Stripe confirms the money, then the
 * account is created, then Hayley hears about it. Nothing is measured until
 * it's real.
 *
 * The password hash lives here because the account must be creatable from the
 * Stripe webhook, by which point the browser may be long gone. It's the same
 * scrypt hash that would have gone into the users table, no weaker for
 * waiting. Rows are pruned after a week.
 */

export interface PendingSignup {
  id: string;
  email: string;
  name: string;
  mobile: string;
  photo: string | null;
  brandId: string;
  platforms: string[];
  goal: string;
  packageId: string;
  passwordHash: string;
  stripeCustomerId: string | null;
  createdAt: string;
  consumedAt: string | null;
  userId: string | null;
}

const FILE = path.join(DATA_DIR, "pending-signups.json");
const KEEP_DAYS = 7;

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

interface Row {
  id: string;
  email: string;
  name: string;
  mobile: string;
  photo: string | null;
  brand_id: string;
  platforms: unknown;
  goal: string;
  package_id: string;
  password_hash: string;
  stripe_customer_id: string | null;
  created_at: string | Date;
  consumed_at: string | Date | null;
  user_id: string | null;
}

function fromRow(r: Row): PendingSignup {
  return {
    id: r.id,
    email: r.email,
    name: r.name,
    mobile: r.mobile,
    photo: r.photo,
    brandId: r.brand_id,
    platforms: Array.isArray(r.platforms) ? (r.platforms as string[]) : [],
    goal: r.goal,
    packageId: r.package_id,
    passwordHash: r.password_hash,
    stripeCustomerId: r.stripe_customer_id,
    createdAt: new Date(r.created_at).toISOString(),
    consumedAt: r.consumed_at ? new Date(r.consumed_at).toISOString() : null,
    userId: r.user_id,
  };
}

async function readFile(): Promise<PendingSignup[]> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8")) as PendingSignup[];
  } catch {
    return [];
  }
}

async function writeFile(rows: PendingSignup[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(rows, null, 2), "utf8");
}

/** Park a signup until it's paid for. Re-attempting with the same email
    replaces the previous row rather than piling up — someone whose card was
    declined comes back and tries again, and that's one signup, not two. */
export async function savePendingSignup(
  input: Omit<PendingSignup, "id" | "createdAt" | "consumedAt" | "userId" | "stripeCustomerId">
): Promise<PendingSignup> {
  const row: PendingSignup = {
    ...input,
    email: input.email.trim().toLowerCase(),
    id: uid(),
    stripeCustomerId: null,
    createdAt: new Date().toISOString(),
    consumedAt: null,
    userId: null,
  };
  if (hasDb()) {
    const rows = await q<Row>(
      `INSERT INTO pending_signups
         (id,email,name,mobile,photo,brand_id,platforms,goal,package_id,password_hash,created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (email) DO UPDATE SET
         name = EXCLUDED.name,
         mobile = EXCLUDED.mobile,
         photo = EXCLUDED.photo,
         brand_id = EXCLUDED.brand_id,
         platforms = EXCLUDED.platforms,
         goal = EXCLUDED.goal,
         package_id = EXCLUDED.package_id,
         password_hash = EXCLUDED.password_hash,
         created_at = EXCLUDED.created_at,
         consumed_at = NULL,
         user_id = NULL
       RETURNING *`,
      [
        row.id,
        row.email,
        row.name,
        row.mobile,
        row.photo,
        row.brandId,
        JSON.stringify(row.platforms),
        row.goal,
        row.packageId,
        row.passwordHash,
        row.createdAt,
      ]
    );
    await q(
      `DELETE FROM pending_signups WHERE created_at < NOW() - INTERVAL '${KEEP_DAYS} days'`
    );
    return fromRow(rows[0]);
  }
  const all = (await readFile()).filter((p) => p.email !== row.email);
  all.unshift(row);
  await writeFile(all);
  return row;
}

export async function findPendingSignup(id: string): Promise<PendingSignup | null> {
  if (!id) return null;
  if (hasDb()) {
    const rows = await q<Row>("SELECT * FROM pending_signups WHERE id = $1", [id]);
    return rows[0] ? fromRow(rows[0]) : null;
  }
  return (await readFile()).find((p) => p.id === id) ?? null;
}

export async function setPendingCustomer(
  id: string,
  customerId: string
): Promise<void> {
  if (hasDb()) {
    await q("UPDATE pending_signups SET stripe_customer_id = $2 WHERE id = $1", [
      id,
      customerId,
    ]);
    return;
  }
  const all = await readFile();
  const hit = all.find((p) => p.id === id);
  if (!hit) return;
  hit.stripeCustomerId = customerId;
  await writeFile(all);
}

async function markConsumed(id: string, userId: string): Promise<void> {
  if (hasDb()) {
    await q(
      "UPDATE pending_signups SET consumed_at = NOW(), user_id = $2 WHERE id = $1",
      [id, userId]
    );
    return;
  }
  const all = await readFile();
  const hit = all.find((p) => p.id === id);
  if (!hit) return;
  hit.consumedAt = new Date().toISOString();
  hit.userId = userId;
  await writeFile(all);
}

/** Everything parked and not yet paid for — the admin "started, never paid"
    list. Consumed rows are excluded: those became real accounts. */
export async function listOpenPendingSignups(): Promise<PendingSignup[]> {
  if (hasDb()) {
    const rows = await q<Row>(
      "SELECT * FROM pending_signups WHERE consumed_at IS NULL ORDER BY created_at DESC"
    );
    return rows.map(fromRow);
  }
  return (await readFile())
    .filter((p) => !p.consumedAt)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/* ── Turning a paid pending signup into a real account ──────────────────── */

export interface PaymentFacts {
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  subscriptionStatus: string | null;
  renewsAt: string | null;
  paid: boolean;
  packageId?: StoredUser["packageId"];
}

export interface MaterialiseResult {
  user: StoredUser;
  /** False when this call found the account already made (a repeat webhook,
      or the browser and the webhook arriving at once). */
  created: boolean;
}

/**
 * Create the account for a pending signup that has been paid for.
 *
 * Called from BOTH the Stripe webhook and the browser's return from Checkout,
 * on purpose: the webhook is authoritative but can lag, and a customer who
 * has just paid should not be left staring at a spinner. Both paths land
 * here, and this is idempotent, so whichever arrives second is a no-op.
 *
 * Only this function sends the "new signup" email, and only when it actually
 * creates the account — so the alert means "someone paid", once, which is
 * exactly what it's for.
 */
export async function materialisePendingSignup(
  pendingId: string,
  facts: PaymentFacts
): Promise<MaterialiseResult | null> {
  const pending = await findPendingSignup(pendingId);
  if (!pending) return null;

  // Somebody could already have an account under this email — they signed up
  // before this change, or paid twice. Update it rather than colliding on the
  // unique email index.
  const existing = await findByEmail(pending.email);
  if (existing) {
    await updateUser(existing.id, {
      stripeCustomerId: facts.stripeCustomerId ?? existing.stripeCustomerId ?? null,
      stripeSubscriptionId: facts.stripeSubscriptionId,
      subscriptionStatus: facts.subscriptionStatus,
      renewsAt: facts.renewsAt,
      paid: facts.paid,
      accountType: "paid",
      ...(facts.packageId ? { packageId: facts.packageId } : {}),
      ...(existing.commitmentEndsAt ? {} : { commitmentEndsAt: commitmentEnd() }),
    });
    await markConsumed(pending.id, existing.id);
    const fresh = (await findByEmail(pending.email))!;
    return { user: fresh, created: false };
  }

  const packageId = packageById(facts.packageId ?? pending.packageId)?.id ?? "starter";

  const user: StoredUser = {
    id: uid(),
    name: pending.name,
    email: pending.email,
    mobile: pending.mobile,
    photo: pending.photo,
    brandId: pending.brandId as StoredUser["brandId"],
    platforms: pending.platforms as StoredUser["platforms"],
    goal: pending.goal,
    packageId,
    paid: facts.paid,
    accountType: "paid",
    createdAt: new Date().toISOString(),
    passwordHash: pending.passwordHash,
    location: null,
    onboardingStage: "signed_up",
    adminNotes: [],
    stripeCustomerId: facts.stripeCustomerId,
    stripeSubscriptionId: facts.stripeSubscriptionId,
    subscriptionStatus: facts.subscriptionStatus,
    renewsAt: facts.renewsAt,
    commitmentEndsAt: commitmentEnd(),
  };

  await createUser(user);
  await markConsumed(pending.id, user.id);
  notifyNewPaidSignup(user);
  return { user, created: true };
}

/* Tell the team — and ONLY from here, so the email means what it says.
   Deliberately not awaited and swallowing its own errors: a notification
   must never be able to fail a payment. */
function notifyNewPaidSignup(user: StoredUser): void {
  const to = process.env.SIGNUP_NOTIFY_EMAIL ?? "Hayley.Cox@TheExpertsGroup.co.uk";
  const brand = brandById(user.brandId);
  const mail = newSignupEmail({
    name: user.name,
    email: user.email,
    brandName: brand?.name ?? user.brandId,
    packageName: packageById(user.packageId)?.name,
    userId: user.id,
  });
  sendSystemEmail({ to, subject: mail.subject, body: mail.html, html: true }).catch(
    () => {}
  );
}
