import "server-only";
import crypto from "crypto";

// Real, dependency-free auth primitives: scrypt password hashing + an
// HMAC-signed session token stored in an httpOnly cookie. This gives proper
// cross-device sign-in today. When moving to Clerk or a database-backed auth,
// this file and lib/users-store.ts are the swap points — the API routes and
// UI stay the same.

const SECRET =
  process.env.AUTH_SECRET ?? "dev-only-secret-change-me-in-production";

export const SESSION_COOKIE = "teg_session";
const SESSION_DAYS = 30;

// ── Passwords ────────────────────────────────────────────────────────────
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64).toString("hex");
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(candidate, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ── Session tokens (HMAC-signed: userId.expiry.signature) ────────────────
function sign(data: string): string {
  return crypto.createHmac("sha256", SECRET).update(data).digest("base64url");
}

export function createSessionToken(userId: string): string {
  const exp = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const data = `${userId}.${exp}`;
  return `${data}.${sign(data)}`;
}

export function verifySessionToken(token: string | undefined): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, exp, sig] = parts;
  if (sign(`${userId}.${exp}`) !== sig) return null;
  if (Number(exp) < Date.now()) return null;
  return userId;
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_DAYS * 24 * 60 * 60,
};
