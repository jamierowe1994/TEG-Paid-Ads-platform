import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth";
import { findById, listUsers } from "@/lib/users-store";
import {
  activePartnersForBrand,
  locationDetails,
  teamHubConfigured,
  type TeamHubPartner,
  type TeamHubLocation,
} from "@/lib/team-hub";
import {
  geocodeUk,
  geocodeOutcode,
  geocodePostcode,
  extractPostcode,
  isOutcode,
  centroid,
  distanceMiles,
  type LatLng,
} from "@/lib/geo-uk";

// The agents you can refer a lead to at a given brand. Sourced from the TEG
// Team Hub (the group partner directory): active partners for the brand,
// geocoded from their territory postcodes / home address so they can be ranked
// by real distance to the referral (?near=<postcode>). Falls back to the
// portal's own signed-up users when the Team Hub isn't configured or has nobody
// for that brand. Returns only safe, non-sensitive fields.

// The furthest a partner can be from the referral and still be offered.
const MAX_MILES = 50;

// A representative coordinate for a partner. Property/Lettings partners carry
// their own territory outward codes; Fine & Country partners instead cover a
// Location (office), so we position them from that office's postcode. Falls
// back to their home-address postcode.
async function partnerCoord(
  p: TeamHubPartner,
  locMap: Map<string, TeamHubLocation>
): Promise<LatLng | null> {
  // 1) Territory postcodes (Property / Lettings).
  const codes = p.territoryPostcodes.filter((c) => isOutcode(c) || extractPostcode(c));
  if (codes.length) {
    const pts = await Promise.all(
      codes.slice(0, 12).map((c) => {
        const full = extractPostcode(c);
        return full ? geocodePostcode(full) : geocodeOutcode(c);
      })
    );
    const c = centroid(pts);
    if (c) return c;
  }
  // 2) Their Location office (Fine & Country) — full office postcode first,
  //    else the centroid of the office's district outward codes.
  const loc = p.locationId ? locMap.get(p.locationId) : null;
  if (loc) {
    if (loc.officePostcode) {
      const c = await geocodePostcode(loc.officePostcode);
      if (c) return c;
    }
    if (loc.districtCodes.length) {
      const pts = await Promise.all(
        loc.districtCodes.slice(0, 12).map((c) => geocodeOutcode(c))
      );
      const c = centroid(pts);
      if (c) return c;
    }
  }
  // 3) Home address postcode.
  const home = extractPostcode(p.homeAddress);
  if (home) return geocodePostcode(home);
  return null;
}

// Human coverage text for display + a keyword-ranking fallback.
function displayArea(
  p: TeamHubPartner,
  locMap: Map<string, TeamHubLocation>
): string {
  if (p.territoryPostcodes.length) {
    const shown = p.territoryPostcodes.slice(0, 5).join(", ");
    const more = p.territoryPostcodes.length - 5;
    return more > 0 ? `${shown} +${more} more` : shown;
  }
  const loc = p.locationId ? locMap.get(p.locationId) : null;
  if (loc?.name) return loc.name;
  if (loc?.districtCodes.length) {
    const shown = loc.districtCodes.slice(0, 5).join(", ");
    const more = loc.districtCodes.length - 5;
    return more > 0 ? `${shown} +${more} more` : shown;
  }
  const home = p.homeAddress?.split(",").slice(-2, -1)[0]?.trim();
  return home || "their patch";
}

export async function GET(req: NextRequest) {
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const me = await findById(userId);
  if (!me) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const brandId = req.nextUrl.searchParams.get("brand");
  if (!brandId) {
    return NextResponse.json({ error: "brand is required" }, { status: 400 });
  }
  const near = (req.nextUrl.searchParams.get("near") ?? "").trim();

  // ── Team Hub partner directory (preferred) ──
  if (teamHubConfigured()) {
    try {
      const partners = await activePartnersForBrand(
        brandId as Parameters<typeof activePartnersForBrand>[0]
      );
      if (partners.length) {
        const locMap = await locationDetails(
          partners.filter((p) => p.locationId).map((p) => p.locationId!)
        );
        let agents = await Promise.all(
          partners.map(async (p) => {
            const coord = await partnerCoord(p, locMap);
            const loc = p.locationId ? locMap.get(p.locationId) : null;
            return {
              id: p.id,
              name: p.name,
              photo: null as string | null,
              location: displayArea(p, locMap),
              since: p.dateSigned ?? "",
              lat: coord?.lat,
              lng: coord?.lng,
              // Coverage codes for the UI: a partner's own territory, else the
              // office's district codes (Fine & Country).
              territory: p.territoryPostcodes.length
                ? p.territoryPostcodes
                : loc?.districtCodes ?? [],
              distanceMiles: null as number | null,
            };
          })
        );

        // Rank by distance to the referral when we can geocode ?near=, and cap
        // the list to partners within MAX_MILES. Partners we couldn't place
        // (no geo data yet) have an unknown distance and are kept, so brands
        // still being set up don't come back empty.
        const refCoord = near ? await geocodeUk(near) : null;
        if (refCoord) {
          agents = agents
            .map((a) => ({
              a,
              d:
                a.lat != null && a.lng != null
                  ? distanceMiles(refCoord, { lat: a.lat, lng: a.lng })
                  : Number.POSITIVE_INFINITY,
            }))
            .sort((x, y) => x.d - y.d)
            .map(({ a, d }) => ({
              ...a,
              distanceMiles: Number.isFinite(d) ? Math.round(d) : null,
            }))
            .filter((a) => a.distanceMiles == null || a.distanceMiles <= MAX_MILES);
        }

        return NextResponse.json({ agents, source: "teamhub" });
      }
    } catch (err) {
      // Team Hub unreachable / misconfigured — fall through to portal users so
      // referrals keep working. Log server-side for diagnosis.
      console.error("Team Hub partner lookup failed:", err);
    }
  }

  // ── Fallback: the portal's own signed-up users for this brand ──
  const all = await listUsers();
  const agents = all
    .filter((u) => u.brandId === brandId && u.id !== userId)
    .map((u) => ({
      id: u.id,
      name: u.name,
      photo: u.photo ?? null,
      location: u.location ?? "",
      since: u.createdAt,
    }));
  return NextResponse.json({ agents, source: "users" });
}
