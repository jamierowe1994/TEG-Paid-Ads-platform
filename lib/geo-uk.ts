// UK geocoding via postcodes.io — free, no API key, and CORS-enabled so it
// works from the server AND the browser. Turns postcodes / outward codes into
// coordinates so referral partners can be ranked by real distance to a lead.
//
// Note: postcodes.io only resolves FULL outward codes (e.g. "KT11"), not bare
// postcode areas ("NE", "S"). Those are skipped for coordinates but still shown
// as coverage text.

export interface LatLng {
  lat: number;
  lng: number;
}

// Full UK postcode (e.g. "ML9 3DU"), tolerant of a missing space.
const FULL_POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;
// Outward code on its own (e.g. "KT11", "B79", "SW1A").
const OUTCODE = /^[A-Z]{1,2}\d[A-Z\d]?$/i;

const cache = new Map<string, LatLng | null>();

// Pull the first full UK postcode out of a free-text address.
export function extractPostcode(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.match(FULL_POSTCODE);
  return m ? `${m[1]} ${m[2]}`.toUpperCase() : null;
}

export function isOutcode(s: string): boolean {
  return OUTCODE.test(s.trim());
}

async function getJson(url: string): Promise<{ result?: unknown } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as { result?: unknown };
  } catch {
    return null;
  }
}

function coordFromResult(result: unknown): LatLng | null {
  const r = result as { latitude?: number; longitude?: number } | null;
  return r && typeof r.latitude === "number" && typeof r.longitude === "number"
    ? { lat: r.latitude, lng: r.longitude }
    : null;
}

export async function geocodePostcode(postcode: string): Promise<LatLng | null> {
  const key = `pc:${postcode.toUpperCase().replace(/\s+/g, " ").trim()}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  const d = await getJson(
    `https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`
  );
  const out = d ? coordFromResult(d.result) : null;
  cache.set(key, out);
  return out;
}

export async function geocodeOutcode(outcode: string): Promise<LatLng | null> {
  const key = `oc:${outcode.toUpperCase().trim()}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  const d = await getJson(
    `https://api.postcodes.io/outcodes/${encodeURIComponent(outcode.trim())}`
  );
  const out = d ? coordFromResult(d.result) : null;
  cache.set(key, out);
  return out;
}

// Geocode any postcode-ish token: a full postcode, a bare outward code, or free
// text containing a postcode. Returns null for bare areas / unrecognised input.
export async function geocodeUk(input: string): Promise<LatLng | null> {
  const s = input.trim();
  if (!s) return null;
  const full = extractPostcode(s);
  if (full) return geocodePostcode(full);
  if (isOutcode(s)) return geocodeOutcode(s);
  return null;
}

export function centroid(points: (LatLng | null)[]): LatLng | null {
  const pts = points.filter((p): p is LatLng => !!p);
  if (!pts.length) return null;
  return {
    lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length,
    lng: pts.reduce((s, p) => s + p.lng, 0) / pts.length,
  };
}

// Haversine distance in kilometres.
export function distanceKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const distanceMiles = (a: LatLng, b: LatLng): number =>
  distanceKm(a, b) * 0.621371;
