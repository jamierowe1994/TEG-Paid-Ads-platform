import "server-only";
import webpush from "web-push";
import { promises as fs } from "fs";
import path from "path";
import { hasDb, q } from "./db";
import { DATA_DIR } from "./data-dir";

/* Web push to the installed PWA — the ONLY way a lead alert can open the app
 * on an iPhone.
 *
 * WHY THIS EXISTS: iOS never lets a tapped LINK open a home-screen web app —
 * links open in Safari (or WhatsApp's in-app browser) regardless of what the
 * URL is. Apple reserves link-capture for App Store apps. What Apple DOES
 * allow (iOS 16.4+) is push notifications sent by the installed PWA itself:
 * a tapped notification opens inside the app, at the URL we choose. So the
 * WhatsApp ping gets the agent's attention wherever they are, and this push
 * is the one that opens the app on the exact lead.
 *
 * VAPID keys are generated ONCE on first use and persisted (Postgres, or the
 * data dir in file mode) rather than configured by hand: a regenerated key
 * pair silently invalidates every existing subscription, so the pair must
 * survive deploys without anyone remembering to set it. Env vars
 * VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY override if ever needed (e.g. to
 * share keys across environments).
 *
 * Everything here is best-effort: a push failure must never break lead
 * creation. Dead subscriptions (404/410 from the push service) are pruned as
 * they're discovered — phones get wiped, PWAs get reinstalled.
 */

const KEYS_FILE = path.join(DATA_DIR, "push-keys.json");
const SUBS_FILE = path.join(DATA_DIR, "push-subs.json");

export interface StoredSub {
  endpoint: string;
  userId: string;
  sub: webpush.PushSubscription;
}

/* ---------- VAPID keys ---------- */

let cachedKeys: { publicKey: string; privateKey: string } | null = null;

async function vapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  if (cachedKeys) return cachedKeys;
  const envPub = process.env.VAPID_PUBLIC_KEY?.trim();
  const envPriv = process.env.VAPID_PRIVATE_KEY?.trim();
  if (envPub && envPriv) {
    cachedKeys = { publicKey: envPub, privateKey: envPriv };
    return cachedKeys;
  }

  if (hasDb()) {
    const rows = await q<{ k: string; v: string }>(
      "SELECT k, v FROM push_config WHERE k IN ('vapid_public','vapid_private')"
    );
    const pub = rows.find((r) => r.k === "vapid_public")?.v;
    const priv = rows.find((r) => r.k === "vapid_private")?.v;
    if (pub && priv) {
      cachedKeys = { publicKey: pub, privateKey: priv };
      return cachedKeys;
    }
    const fresh = webpush.generateVAPIDKeys();
    // ON CONFLICT DO NOTHING + re-read: two instances generating at once must
    // converge on whichever pair landed first, not clobber each other.
    await q(
      "INSERT INTO push_config (k, v) VALUES ('vapid_public',$1), ('vapid_private',$2) ON CONFLICT (k) DO NOTHING",
      [fresh.publicKey, fresh.privateKey]
    );
    const after = await q<{ k: string; v: string }>(
      "SELECT k, v FROM push_config WHERE k IN ('vapid_public','vapid_private')"
    );
    cachedKeys = {
      publicKey: after.find((r) => r.k === "vapid_public")!.v,
      privateKey: after.find((r) => r.k === "vapid_private")!.v,
    };
    return cachedKeys;
  }

  try {
    cachedKeys = JSON.parse(await fs.readFile(KEYS_FILE, "utf8"));
    return cachedKeys!;
  } catch {
    const fresh = webpush.generateVAPIDKeys();
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(KEYS_FILE, JSON.stringify(fresh, null, 2), "utf8");
    cachedKeys = fresh;
    return cachedKeys;
  }
}

/** The public key the browser needs to subscribe. Safe to expose. */
export async function vapidPublicKey(): Promise<string> {
  return (await vapidKeys()).publicKey;
}

/* ---------- subscriptions ---------- */

async function readSubsFile(): Promise<StoredSub[]> {
  try {
    return JSON.parse(await fs.readFile(SUBS_FILE, "utf8"));
  } catch {
    return [];
  }
}
async function writeSubsFile(all: StoredSub[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(SUBS_FILE, JSON.stringify(all, null, 2), "utf8");
}

export async function saveSubscription(
  userId: string,
  sub: webpush.PushSubscription
): Promise<void> {
  if (hasDb()) {
    // The endpoint is the identity: re-subscribing updates ownership, so a
    // shared iPad handed to a new agent alerts the CURRENT owner only.
    await q(
      `INSERT INTO push_subs (endpoint, user_id, sub) VALUES ($1,$2,$3)
         ON CONFLICT (endpoint) DO UPDATE SET user_id = $2, sub = $3`,
      [sub.endpoint, userId, JSON.stringify(sub)]
    );
    return;
  }
  const all = (await readSubsFile()).filter((s) => s.endpoint !== sub.endpoint);
  all.push({ endpoint: sub.endpoint, userId, sub });
  await writeSubsFile(all);
}

export async function removeSubscription(endpoint: string): Promise<void> {
  if (hasDb()) {
    await q("DELETE FROM push_subs WHERE endpoint = $1", [endpoint]);
    return;
  }
  await writeSubsFile((await readSubsFile()).filter((s) => s.endpoint !== endpoint));
}

async function subsForUser(userId: string): Promise<StoredSub[]> {
  if (hasDb()) {
    const rows = await q<{ endpoint: string; user_id: string; sub: unknown }>(
      "SELECT endpoint, user_id, sub FROM push_subs WHERE user_id = $1",
      [userId]
    );
    return rows.map((r) => ({
      endpoint: r.endpoint,
      userId: r.user_id,
      sub: (typeof r.sub === "string" ? JSON.parse(r.sub) : r.sub) as webpush.PushSubscription,
    }));
  }
  return (await readSubsFile()).filter((s) => s.userId === userId);
}

/** Does this user have any device subscribed? (drives the UI prompt) */
export async function hasSubscription(userId: string): Promise<boolean> {
  return (await subsForUser(userId)).length > 0;
}

/* ---------- sending ---------- */

export async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; url: string; tag?: string }
): Promise<{ sent: number; pruned: number }> {
  const out = { sent: 0, pruned: 0 };
  let subs: StoredSub[];
  let keys: { publicKey: string; privateKey: string };
  try {
    subs = await subsForUser(userId);
    if (!subs.length) return out;
    keys = await vapidKeys();
  } catch {
    return out;
  }

  for (const s of subs) {
    try {
      await webpush.sendNotification(s.sub, JSON.stringify(payload), {
        vapidDetails: {
          // A mailto the push service can contact if we misbehave — required
          // by the spec, never shown to agents.
          subject: "mailto:james@therecruitmentexperts.co.uk",
          publicKey: keys.publicKey,
          privateKey: keys.privateKey,
        },
        TTL: 60 * 60, // an hour — a lead alert older than that has been superseded
      });
      out.sent++;
    } catch (e) {
      const code = (e as { statusCode?: number })?.statusCode;
      if (code === 404 || code === 410) {
        // The phone unsubscribed / the PWA was removed — forget it.
        await removeSubscription(s.endpoint).catch(() => {});
        out.pruned++;
      }
      // Anything else (throttling, transient) — best-effort, move on.
    }
  }
  return out;
}
