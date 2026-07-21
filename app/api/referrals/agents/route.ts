import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth";
import { findById, listUsers } from "@/lib/users-store";
import {
  activePartnersForBrand,
  locationNames,
  teamHubConfigured,
  type TeamHubPartner,
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

// A representative coordinate for a partner: centroid of their geocodable
// territory outward codes, else the postcode from their home address.
async function partnerCoord(p: TeamHubPartner): Promise<LatLng | null> {
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
  const home = extractPostcode(p.homeAddress);
  if (home) return geocodePostcode(home);
  return null;
}

// Human coverage text for display + a keyword-ranking fallback.
function displayArea(p: TeamHubPartner, locMap: Map<string, string>): string {
  if (p.territoryPostcodes.length) {
    const shown = p.territoryPostcodes.slice(0, 5).join(", ");
    const more = p.territoryPostcodes.length - 5;
    return more > 0 ? `${shown} +${more} more` : shown;
  }
  if (p.locationId && locMap.get(p.locationId)) return locMap.get(p.locationId)!;
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
        const locMap = await locationNames(
          partners.filter((p) => p.locationId).map((p) => p.locationId!)
        );
        let agents = await Promise.all(
          partners.map(async (p) => {
            const coord = await partnerCoord(p);
            return {
              id: p.id,
              name: p.name,
              photo: null as string | null,
              location: displayArea(p, locMap),
              since: p.dateSigned ?? "",
              lat: coord?.lat,
              lng: coord?.lng,
              territory: p.territoryPostcodes,
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
