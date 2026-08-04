import "server-only";
import type { BrandId } from "./brands";
import { extractPostcode } from "./geo-uk";

// Client for the TEG Team Hub Database API (the group-wide people/partner
// directory, a separate Base44 app). Used to find the partners at a brand so a
// referral can be routed to the closest one. READ-ONLY here — we never write.
//
// The secret grants full read/write to sensitive records, so it lives ONLY in
// an env var (TEAM_HUB_API_SECRET) on the server, never in the client bundle.
// Set the same vars in Railway; rotating is just swapping the variable.

const DEFAULT_URL = "https://teg-team-hub.base44.app/functions/dbApi";

export function teamHubUrl(): string {
  return process.env.TEAM_HUB_API_URL || DEFAULT_URL;
}
function secret(): string | undefined {
  return process.env.TEAM_HUB_API_SECRET || undefined;
}
export function teamHubConfigured(): boolean {
  return !!secret();
}

// Portal brand id → Team Hub Brand short_code (resolved to the Hub's own id at
// runtime, so we don't hard-code their record ids).
const BRAND_SHORT: Partial<Record<BrandId, string>> = {
  property: "TPE",
  lettings: "TLE",
  mortgage: "TME",
  recruitment: "TRE",
  commercial: "TCPE",
  fineandcountry: "FNC",
  auction: "TAC",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(
  action: string,
  entity: string,
  body: Record<string, unknown> = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const key = secret();
  if (!key) throw new Error("Team Hub not configured");
  const res = await fetch(teamHubUrl(), {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-secret": key },
    body: JSON.stringify({ action, entity, ...body }),
    cache: "no-store", // never cache people/PII
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || `Team Hub ${action}/${entity} failed (${res.status})`);
  }
  return data.data;
}

// Brand short_code → Hub id, cached for the process (brands rarely change).
let brandMap: Map<string, string> | null = null;
async function hubBrandId(short: string): Promise<string | null> {
  if (!brandMap) {
    const rows = await call("list", "Brand", {
      limit: 100,
      fields: ["id", "short_code"],
    });
    brandMap = new Map(
      (rows || []).map((b: { id: string; short_code: string }) => [
        String(b.short_code),
        String(b.id),
      ])
    );
  }
  return brandMap.get(short) ?? null;
}

export interface TeamHubPartner {
  id: string;
  name: string;
  firstName: string;
  jobTitle: string | null;
  territoryPostcodes: string[];
  homeAddress: string | null;
  locationId: string | null;
  dateSigned: string | null;
}

// Statuses that mean "not a live, referable partner".
const DEAD_STATUS = new Set(["Departed", "Duplicate"]);

// Active, referable partners at a portal brand: person_type Partner, active,
// not Departed/Duplicate. Only non-sensitive fields are requested.
export async function activePartnersForBrand(
  brandId: BrandId
): Promise<TeamHubPartner[]> {
  const short = BRAND_SHORT[brandId];
  if (!short) return [];
  const hubId = await hubBrandId(short);
  if (!hubId) return [];
  const rows: Record<string, unknown>[] = await call("search", "TeamMember", {
    query: { primary_brand_id: hubId, active: true },
    limit: 500,
    fields: [
      "id",
      "first_name",
      "last_name",
      "person_type",
      "status",
      "job_title",
      "home_address",
      "territory_postcodes",
      "location_id",
      "date_signed",
      "date_launched",
    ],
  });
  return (rows || [])
    .filter(
      (r) =>
        r.person_type === "Partner" && !DEAD_STATUS.has(String(r.status ?? ""))
    )
    .map((r) => {
      const first = String(r.first_name ?? "");
      const last = String(r.last_name ?? "");
      return {
        id: String(r.id),
        firstName: first,
        name: `${first} ${last}`.trim() || "Partner",
        jobTitle: (r.job_title as string) || null,
        // Territory postcodes arrive as {code, level} objects (same shape as
        // Location.postcodes) — flatten to the outward-code strings the geo
        // helpers expect. Tolerates plain strings too, just in case.
        territoryPostcodes: Array.isArray(r.territory_postcodes)
          ? (r.territory_postcodes as unknown[])
              .map((c) =>
                typeof c === "string"
                  ? c
                  : String((c as { code?: string })?.code ?? "")
              )
              .map((s) => s.trim())
              .filter(Boolean)
          : [],
        homeAddress: (r.home_address as string) || null,
        locationId: (r.location_id as string) || null,
        dateSigned: (r.date_signed as string) || (r.date_launched as string) || null,
      };
    });
}

// A Team Hub Location (an office/branch). Fine & Country partners cover a
// Location rather than carrying their own territory postcodes, so this is how
// we position them: the office's full postcode (most precise), or the centroid
// of its district outward codes.
/* Staff list for PROVISIONING portal accounts.
 *
 * Deliberately a separate call from activePartnersForBrand rather than adding
 * `email` to that one: it's used for referral matching and comments that it
 * only asks for non-sensitive fields. It shouldn't start carrying 260 email
 * addresses just because provisioning needs them.
 *
 * Returns every live Partner across all brands — the caller maps them to a
 * portal brand by email domain, which is the same rule signup uses.
 */
export interface TeamHubStaff {
  id: string;
  name: string;
  email: string;
  brandHubId: string | null;
  jobTitle: string | null;
}

export async function allPartnersForImport(): Promise<TeamHubStaff[]> {
  const rows: Record<string, unknown>[] = await call("search", "TeamMember", {
    query: { active: true },
    limit: 1000,
    fields: [
      "id",
      "first_name",
      "last_name",
      "email",
      "person_type",
      "status",
      "job_title",
      "primary_brand_id",
    ],
  });
  return (rows || [])
    .filter(
      (r) =>
        r.person_type === "Partner" && !DEAD_STATUS.has(String(r.status ?? ""))
    )
    .map((r) => {
      const first = String(r.first_name ?? "").trim();
      const last = String(r.last_name ?? "").trim();
      return {
        id: String(r.id),
        name: `${first} ${last}`.trim() || "Partner",
        email: String(r.email ?? "").trim().toLowerCase(),
        brandHubId: (r.primary_brand_id as string) || null,
        jobTitle: (r.job_title as string) || null,
      };
    })
    .filter((p) => p.email.includes("@"));
}

export interface TeamHubLocation {
  id: string;
  name: string;
  officePostcode: string | null; // full postcode pulled from office_address
  districtCodes: string[]; // outward codes from the postcodes[] array
}

// Resolve Location ids → name + geocoding hints (display + distance ranking).
// Best effort: on any error the caller just gets an empty map.
export async function locationDetails(
  ids: string[]
): Promise<Map<string, TeamHubLocation>> {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return new Map();
  try {
    const rows: Record<string, unknown>[] = await call("search", "Location", {
      query: { id: { $in: uniq } },
      limit: 500,
      fields: ["id", "name", "postcodes", "office_address"],
    });
    return new Map(
      (rows || []).map((r) => {
        const codes = Array.isArray(r.postcodes)
          ? (r.postcodes as { code?: string }[])
              .map((p) => String(p?.code ?? "").trim())
              .filter(Boolean)
          : [];
        const id = String(r.id);
        return [
          id,
          {
            id,
            name: String(r.name ?? ""),
            officePostcode: extractPostcode(String(r.office_address ?? "")),
            districtCodes: codes,
          } as TeamHubLocation,
        ];
      })
    );
  } catch {
    return new Map();
  }
}

// ── Partner package (the licence tier) ──────────────────────────────────────
//
// Drives who gets Paid Ads included rather than paying for it. Read live from
// the Hub rather than copied onto our own user record, so an upgrade there
// takes effect here without a re-sync — and so we never hold a stale answer to
// a billing question.
//
// WHY THIS PAGES THE WHOLE DIRECTORY INSTEAD OF SEARCHING BY EMAIL:
// the Hub's `search` is CASE-SENSITIVE, and 45% of stored addresses are
// mixed-case (measured 4 Aug 2026: 246 of 544). Lowercasing the input — which
// is the correct thing to do with an email everywhere else — therefore MISSES
// nearly half of everyone, and misses them silently: the search returns zero
// rows, indistinguishable from "this person isn't a partner". That routed Pro
// partners signing up with their work address to the upgrade page instead of
// letting them in free.
//
// Matching in memory is one request for ~550 records and cannot be fooled by
// case. Do not "optimise" this back into a per-email search.

export interface TeamHubPackage {
  /** The raw `partner_package` value, e.g. "Pro" / "Basic". Null if not set. */
  partnerPackage: string | null;
  /** False when the Hub holds no matching person at all. */
  found: boolean;
}

interface DirectoryEntry {
  partnerPackage: string | null;
  status: string;
}

// The directory changes when someone joins, leaves or upgrades — days, not
// seconds. Cached so a signup doesn't re-pull 550 records per keystroke.
const DIRECTORY_TTL_MS = 10 * 60 * 1000;
let directory: { byEmail: Map<string, DirectoryEntry>; at: number } | null = null;
let directoryInFlight: Promise<Map<string, DirectoryEntry>> | null = null;

async function fetchDirectory(): Promise<Map<string, DirectoryEntry>> {
  const rows: Record<string, unknown>[] = await call("list", "TeamMember", {
    limit: 2000,
    fields: ["email", "personal_email", "partner_package", "status"],
  });
  const map = new Map<string, DirectoryEntry>();
  for (const r of rows || []) {
    const status = String(r.status ?? "");
    if (DEAD_STATUS.has(status)) continue;
    const pkg = String(r.partner_package ?? "").trim() || null;
    for (const field of ["email", "personal_email"]) {
      const addr = String(r[field] ?? "").trim().toLowerCase();
      if (!addr) continue;
      // First writer wins, EXCEPT that a record carrying a package beats one
      // without: if the same address appears twice, the useful answer is the
      // one that can actually decide entitlement.
      const existing = map.get(addr);
      if (!existing || (!existing.partnerPackage && pkg)) {
        map.set(addr, { partnerPackage: pkg, status });
      }
    }
  }
  return map;
}

async function getDirectory(): Promise<Map<string, DirectoryEntry> | null> {
  if (directory && Date.now() - directory.at < DIRECTORY_TTL_MS) {
    return directory.byEmail;
  }
  if (directoryInFlight) return directoryInFlight;
  directoryInFlight = fetchDirectory()
    .then((byEmail) => {
      directory = { byEmail, at: Date.now() };
      return byEmail;
    })
    .finally(() => {
      directoryInFlight = null;
    });
  try {
    return await directoryInFlight;
  } catch {
    return null;
  }
}

/**
 * Look up someone's licence tier by email.
 *
 * Checks BOTH the work and personal address, case-insensitively: partners sign
 * up with whichever they think of, and the Hub's own casing is inconsistent.
 *
 * Never throws — an unreachable Hub returns `found: false`, which the caller
 * must treat as "not proven entitled" rather than "not entitled".
 */
export async function packageForEmail(email: string): Promise<TeamHubPackage> {
  const clean = email.trim().toLowerCase();
  if (!clean || !teamHubConfigured()) return { partnerPackage: null, found: false };
  const dir = await getDirectory();
  if (!dir) return { partnerPackage: null, found: false };
  const hit = dir.get(clean);
  return hit
    ? { partnerPackage: hit.partnerPackage, found: true }
    : { partnerPackage: null, found: false };
}

export interface BrandPartner {
  hubId: string;
  name: string;
  /** Work address, falling back to personal. Blank when the Hub has neither —
   *  the admin UI lets it be typed in rather than dropping the person. */
  email: string;
  partnerPackage: string | null;
}

/**
 * Live partners at a brand, with their licence tier.
 *
 * Resolved via the Hub's OWN brand id rather than the email domain: a partner
 * whose Hub record carries a personal address would otherwise be filed under
 * the wrong brand, or dropped entirely. (The bulk import does match on domain,
 * which is fine for its purpose but not for deciding entitlement.)
 */
export async function partnersForBrandWithPackage(
  brandId: BrandId
): Promise<BrandPartner[]> {
  const short = BRAND_SHORT[brandId];
  if (!short || !teamHubConfigured()) return [];
  const hubId = await hubBrandId(short);
  if (!hubId) return [];

  const rows: Record<string, unknown>[] = await call("search", "TeamMember", {
    query: { primary_brand_id: hubId, active: true },
    limit: 500,
    fields: [
      "id",
      "first_name",
      "last_name",
      "email",
      "personal_email",
      "partner_package",
      "person_type",
      "status",
    ],
  });

  return (rows || [])
    .filter(
      (r) =>
        r.person_type === "Partner" && !DEAD_STATUS.has(String(r.status ?? ""))
    )
    .map((r) => ({
      hubId: String(r.id),
      name: [r.first_name, r.last_name].filter(Boolean).join(" ").trim(),
      email: String(r.email ?? r.personal_email ?? "").trim().toLowerCase(),
      partnerPackage: String(r.partner_package ?? "").trim() || null,
    }));
}
