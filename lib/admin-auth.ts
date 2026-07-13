import "server-only";
import crypto from "crypto";
import type { NextRequest } from "next/server";
import type { BrandId } from "./brands";

// Two admin tiers:
//  • super — full access to everything (connections, every brand's data).
//    Authenticate with ADMIN_PASSWORD; their bearer IS that password, so all
//    the existing admin routes keep working untouched.
//  • md   — a business's managing director. Brand-scoped: only their own team,
//    leads and stats. Authenticate with a SEPARATE ADMIN_MD_PASSWORD and get a
//    signed, brand-stamped token. Because MDs never hold the super password
//    they can't reach any super-only route.
//
// The directory of who's who is env-driven (ADMIN_DIRECTORY = JSON array of
// { email, role, brandId? }) so emails can be managed without a deploy; a
// small default seed keeps dev + the known super admin working.

export type AdminRole = "super" | "md";

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

const DEFAULT_DIRECTORY: AdminEntry[] = [
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
  // The Letting Experts' MD. (More MDs can be added here, or via the
  // ADMIN_DIRECTORY env var — but note that setting ADMIN_DIRECTORY REPLACES
  // this whole list, so it must include the super admins above too.)
  {
    email: "susan@thelettingexperts.co.uk",
    role: "md",
    brandId: "lettings",
    name: "Susan Liles",
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

function signMdToken(email: string, brandId: BrandId): string {
  const exp = Date.now() + MD_DAYS * 24 * 60 * 60 * 1000;
  // base64url payload so an email's dots can't be confused for delimiters.
  const payload = Buffer.from(
    JSON.stringify({ email, brandId, exp })
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

interface MdScope {
  role: "md";
  email: string;
  brandId: BrandId;
}

function verifyMdToken(token: string): MdScope | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig || sign(payload) !== sig) return null;
  try {
    const { email, brandId, exp } = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as { email: string; brandId: BrandId; exp: number };
    if (!email || !brandId || exp < Date.now()) return null;
    return { role: "md", email, brandId };
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

export function verifyAdminLogin(
  email: string,
  password: string
): AdminLoginResult | null {
  const entry = lookupAdmin(email);
  if (!entry) return null;
  if (entry.role === "super") {
    if (password !== superPassword()) return null;
    // Super's bearer is the raw password — the existing routes accept it.
    return { token: superPassword(), role: "super", name: entry.name, email: entry.email };
  }
  // md
  if (password !== mdPassword()) return null;
  if (!entry.brandId) return null;
  return {
    token: signMdToken(entry.email, entry.brandId),
    role: "md",
    brandId: entry.brandId,
    name: entry.name,
    email: entry.email,
  };
}

// ── Request authorisation ────────────────────────────────────────────────────
export type AdminScope =
  | { role: "super" }
  | { role: "md"; email: string; brandId: BrandId };

function bearer(req: NextRequest): string {
  return (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/, "");
}

// Who's calling — super (raw password) or a scoped MD (signed token). Null if
// neither. Used by the data routes that both tiers can hit.
export function adminScope(req: NextRequest): AdminScope | null {
  const tok = bearer(req);
  if (!tok) return null;
  if (tok === superPassword()) return { role: "super" };
  const md = verifyMdToken(tok);
  return md ? md : null;
}

// Super-only guard (kept for routes that migrate to this helper).
export function isSuperAdmin(req: NextRequest): boolean {
  return bearer(req) === superPassword();
}
