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
