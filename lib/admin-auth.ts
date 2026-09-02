import "server-only";
import crypto from "crypto";
import type { NextRequest } from "next/server";
import type { BrandId } from "./brands";
import {
  findAdminUserByEmail,
  touchAdminLogin,
  upsertAdminUser,
  type AdminUser,
} from "./admin-users";
import { verifyPassword } from "./auth";

// Three admin tiers:
//  • super — full access to everything (connections, every brand's data).
//    Authenticate with ADMIN_PASSWORD; their bearer IS that password, so all
//    the existing admin routes keep working untouched.
//  • md   — a business's managing director. Brand-scoped: only their own team,
//    leads and stats. Authenticate with a SEPARATE ADMIN_MD_PASSWORD and get a
//    signed, brand-stamped token. Because MDs never hold the super password
//    they can't reach any super-only route.
//  • marketing — a brand's marketing person (Francesca for TLE). Sees the
//    stats for the agents they look after and manages that brand's lead
//    magnets; none of the operational powers (invites, connections, view-as).
//    Authenticate with ADMIN_MARKETING_PASSWORD — set it in Railway before
//    telling anyone their login exists.
//
// The directory of who's who is env-driven (ADMIN_DIRECTORY = JSON array of
// { email, role, brandId? }) so emails can be managed without a deploy; a
// small default seed keeps dev + the known super admin working.

export type AdminRole = "super" | "md" | "marketing";

export interface AdminEntry {
  email: string;
  role: AdminRole;
  brandId?: BrandId;
  name?: string;
}

const SECRET =
  process.env.AUTH_SECRET ?? "dev-only-secret-change-me-in-production";

function superPassword(): string {
  return process.env.ADMIN_PASSWORD ?? "experts-admin";
}
function mdPassword(): string {
  return process.env.ADMIN_MD_PASSWORD ?? "experts-md";
}
function marketingPassword(): string {
  return process.env.ADMIN_MARKETING_PASSWORD ?? "experts-marketing";
}

const DEFAULT_DIRECTORY: AdminEntry[] = [
  // ── Super: every brand, plus connections, billing and provisioning ──────
  {
    email: "james@therecruitmentexperts.co.uk",
    role: "super",
    name: "James Rowe",
  },
  {
    email: "howard.russell@theexpertsgroup.co.uk",
    role: "super",
    name: "Howard Russell",
  },
  {
    email: "hayley.cox@theexpertsgroup.co.uk",
    role: "super",
    name: "Hayley Cox",
  },
  // CEO of all brands. "super" because it's the only tier that sees every
  // business — note that it also carries the operational powers (system
  // mailbox, bulk invites, Stripe-facing screens), which a read-only
  // group-wide tier would not. Worth splitting if that ever matters.
  {
    email: "sean@theexpertsgroup.co.uk",
    role: "super",
    name: "Sean Newman",
  },

  // ── MDs: their own business only ────────────────────────────────────────
  // Adding people here is a deploy. They can also be managed without one via
  // the ADMIN_DIRECTORY env var — but that REPLACES this whole list, so it
  // must repeat the super admins above or you lock yourself out.
  {
    email: "jim@thepropertyexperts.co.uk",
    role: "md",
    brandId: "property",
    name: "Jim Harris",
  },
  {
    email: "susan@thelettingexperts.co.uk",
    role: "md",
    brandId: "lettings",
    name: "Susan Liles",
  },
  {
    email: "steve@commercialpropertyexperts.co.uk",
    role: "md",
    brandId: "commercial",
    name: "Steve Bell",
  },
  // Deliberately not an Experts Group domain — MAB is the Mortgage Experts'
  // parent. Admin sign-in matches on this directory, not on email domain, so
  // this works; agent signup would reject it.
  {
    email: "gareth.love1@mab.org.uk",
    role: "md",
    brandId: "mortgage",
    name: "Gareth Love",
  },
  {
    email: "ray@theauctioncompany.co.uk",
    role: "md",
    brandId: "auction",
    name: "Ray Purchase",
  },
  {
    email: "lee.armstrong@fineandcountry.com",
    role: "md",
    brandId: "fineandcountry",
    name: "Lee Armstrong",
  },
  // The Recruitment Experts' MD is James, who is already a super admin above.

  // ── Marketing: their brand's stats + lead magnets, nothing operational ──
  {
    email: "francesca.barrett@thelettingexperts.co.uk",
    role: "marketing",
    brandId: "lettings",
    name: "Francesca Barrett",
  },
];

function directory(): AdminEntry[] {
  const raw = process.env.ADMIN_DIRECTORY;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as AdminEntry[];
      if (Array.isArray(parsed)) {
        return parsed.map((e) => ({ ...e, email: e.email.toLowerCase() }));
      }
    } catch {
      /* fall back to the default seed on malformed config */
    }
  }
  return DEFAULT_DIRECTORY.map((e) => ({ ...e, email: e.email.toLowerCase() }));
}

export function lookupAdmin(email: string): AdminEntry | undefined {
  const needle = email.trim().toLowerCase();
  return directory().find((e) => e.email === needle);
}

// ── MD tokens (signed: md.email.brandId.expiry.sig) ──────────────────────────
const MD_DAYS = 7;

function sign(data: string): string {
  return crypto.createHmac("sha256", SECRET).update(data).digest("base64url");
}

function signScopedToken(
  email: string,
  brandId: BrandId,
  role: "md" | "marketing"
): string {
  const exp = Date.now() + MD_DAYS * 24 * 60 * 60 * 1000;
  // base64url payload so an email's dots can't be confused for delimiters.
  const payload = Buffer.from(
    JSON.stringify({ email, brandId, exp, role })
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

interface ScopedAdmin {
  role: "md" | "marketing";
  email: string;
  brandId: BrandId;
}

function verifyScopedToken(token: string): ScopedAdmin | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig || sign(payload) !== sig) return null;
  try {
    const { email, brandId, exp, role } = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as { email: string; brandId: BrandId; exp: number; role?: string };
    if (!email || !brandId || exp < Date.now()) return null;
    // Tokens minted before the marketing tier carry no role — they were all
    // MD tokens, so that's what they stay.
    return { role: role === "marketing" ? "marketing" : "md", email, brandId };
  } catch {
    return null;
  }
}

// ── Login ────────────────────────────────────────────────────────────────────
export interface AdminLoginResult {
  token: string; // bearer for subsequent admin calls
  role: AdminRole;
  brandId?: BrandId;
  name?: string;
  email: string;
}

/** The bearer + role bundle for a stored admin. Used by login and by the
    magic-link setup route, so a freshly-set password signs them straight in
    rather than bouncing them to the login form. */
export function loginResultFor(admin: AdminUser): AdminLoginResult {
  if (admin.role === "super" || !admin.brandId) {
    // Super's bearer IS the shared password — every super route checks for
    // it. A personal password is just another way of proving you're allowed
    // to hold it.
    return { token: superPassword(), role: "super", name: admin.name, email: admin.email };
  }
  return {
    token: signScopedToken(admin.email, admin.brandId, admin.role),
    role: admin.role,
    brandId: admin.brandId,
    name: admin.name,
    email: admin.email,
  };
}

/** Make sure a directory admin has a row of their own — so they can be
    listed, have "last signed in", and be sent a magic link. Idempotent. */
export async function adoptDirectoryAdmin(entry: AdminEntry): Promise<AdminUser> {
  const existing = await findAdminUserByEmail(entry.email);
  if (existing) return existing;
  return upsertAdminUser({
    email: entry.email,
    name: entry.name ?? entry.email,
    role: entry.role,
    brandId: entry.brandId ?? null,
    invitedBy: "directory",
  });
}

export async function verifyAdminLogin(
  email: string,
  password: string
): Promise<AdminLoginResult | null> {
  const entry = lookupAdmin(email);
  const stored = await findAdminUserByEmail(email);

  // A personal password, if they've set one, wins — whether they were
  // invited or came from the directory and later chose their own.
  if (stored?.passwordHash && verifyPassword(password, stored.passwordHash)) {
    await touchAdminLogin(stored.id);
    // The directory is still the authority on ROLE for people in it.
    return entry ? { ...loginResultFor({ ...stored, role: entry.role, brandId: entry.brandId ?? null }) } : loginResultFor(stored);
  }
  if (!entry) return null;

  // Directory admins: the shared tier password.
  let result: AdminLoginResult;
  if (entry.role === "super") {
    if (password !== superPassword()) return null;
    result = { token: superPassword(), role: "super", name: entry.name, email: entry.email };
  } else {
    const pw = entry.role === "marketing" ? marketingPassword() : mdPassword();
    if (password !== pw || !entry.brandId) return null;
    result = {
      token: signScopedToken(entry.email, entry.brandId, entry.role),
      role: entry.role,
      brandId: entry.brandId,
      name: entry.name,
      email: entry.email,
    };
  }
  // Record the sign-in against a row of their own (created on first login).
  try {
    const row = await adoptDirectoryAdmin(entry);
    await touchAdminLogin(row.id);
  } catch {
    /* bookkeeping only — never fail a login over it */
  }
  return result;
}

export function directoryEntries(): AdminEntry[] {
  return directory();
}

// ── Request authorisation ────────────────────────────────────────────────────
export type AdminScope =
  | { role: "super" }
  | { role: "md"; email: string; brandId: BrandId }
  | { role: "marketing"; email: string; brandId: BrandId };

function bearer(req: NextRequest): string {
  return (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/, "");
}

// Who's calling — super (raw password) or a brand-scoped tier (signed token).
// Null if neither. Used by the data routes all tiers can hit.
export function adminScope(req: NextRequest): AdminScope | null {
  const tok = bearer(req);
  if (!tok) return null;
  if (tok === superPassword()) return { role: "super" };
  const scoped = verifyScopedToken(tok);
  return scoped ? scoped : null;
}

// Super-only guard (kept for routes that migrate to this helper).
export function isSuperAdmin(req: NextRequest): boolean {
  return bearer(req) === superPassword();
}
