// Google Maps JS loader — injects the script once and hands back the maps
// namespace. The key is a NEXT_PUBLIC_ var because the Maps JS API runs in the
// browser; it's secured by an HTTP-referrer restriction in Google Cloud, not
// by secrecy. No key set → loader returns null and the UI falls back to a
// plain text box, so referrals keep working before the map is wired up.

// Loose typing so we don't need the @types/google.maps package.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type GoogleMaps = any;

let mapsPromise: Promise<GoogleMaps> | null = null;

export function googleMapsKey(): string | undefined {
  return process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || undefined;
}

export function loadGoogleMaps(): Promise<GoogleMaps> | null {
  const key = googleMapsKey();
  if (!key || typeof window === "undefined") return null;
  if (mapsPromise) return mapsPromise;

  mapsPromise = new Promise<GoogleMaps>((resolve, reject) => {
    const w = window as unknown as Record<string, unknown> & {
      google?: { maps?: unknown };
    };
    if (w.google?.maps) {
      resolve(w.google.maps);
      return;
    }
    const cb = "__tegGoogleMapsReady";
    (w as Record<string, unknown>)[cb] = () => resolve(w.google!.maps);
    const s = document.createElement("script");
    s.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}` +
      `&libraries=places&loading=async&callback=${cb}`;
    s.async = true;
    s.onerror = () => {
      mapsPromise = null; // let a later attempt retry
      reject(new Error("Failed to load Google Maps"));
    };
    document.head.appendChild(s);
  });
  return mapsPromise;
}

// Geocode a free-text place (an agent's patch) to coordinates, client-side,
// using the same referrer-restricted key. Cached per address so a wizard open
// only ever geocodes each agent once. Returns null with no key / no match, so
// callers fall back to keyword matching.
const geoCache = new Map<string, { lat: number; lng: number } | null>();

export async function geocodeAddress(
  address: string
): Promise<{ lat: number; lng: number } | null> {
  const q = address.trim();
  if (!q) return null;
  if (geoCache.has(q)) return geoCache.get(q) ?? null;
  const p = loadGoogleMaps();
  if (!p) return null;
  try {
    const g = await p;
    const geocoder = new g.Geocoder();
    const result = await new Promise<{ lat: number; lng: number } | null>(
      (resolve) => {
        geocoder.geocode(
          { address: q, componentRestrictions: { country: "gb" } },
          (res: unknown[], status: string) => {
            const loc = (
              res?.[0] as { geometry?: { location?: { lat(): number; lng(): number } } }
            )?.geometry?.location;
            resolve(
              status === "OK" && loc ? { lat: loc.lat(), lng: loc.lng() } : null
            );
          }
        );
      }
    );
    geoCache.set(q, result);
    return result;
  } catch {
    return null;
  }
}

// Haversine distance in km — used to rank agents by how close their patch is
// to the picked pin.
export function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
