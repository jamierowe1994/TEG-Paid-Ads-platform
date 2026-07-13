"use client";
import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps, googleMapsKey, type GoogleMaps } from "@/lib/google-maps";

// Interactive location picker for the referral flow: type an address (with
// Google Places suggestions), drop/drag a pin on the map, or tap "Use my
// location". Whatever's chosen bubbles up as { label, lat, lng } so we can
// match the closest agent by real distance.
//
// Degrades gracefully: with no Maps key it's just the text box + city chips,
// exactly as before, so referrals never depend on the map being wired up.

const inputCls =
  "w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-gray-900";

// UK centre-ish starting view until the user narrows it down.
const UK_CENTRE = { lat: 53.6, lng: -2.6 };

// Pull a friendly town/area name out of a geocoder result.
function shortPlaceName(result: {
  address_components?: { long_name: string; types: string[] }[];
  formatted_address?: string;
}): string {
  const comps = result.address_components ?? [];
  const pick = (type: string) =>
    comps.find((c) => c.types.includes(type))?.long_name;
  return (
    pick("postal_town") ||
    pick("locality") ||
    pick("administrative_area_level_2") ||
    pick("postal_code") ||
    result.formatted_address ||
    ""
  );
}

export default function LocationPicker({
  accent,
  value,
  onChange,
  onEnter,
}: {
  accent: string;
  value: string;
  onChange: (v: { label: string; lat?: number; lng?: number }) => void;
  onEnter?: () => void;
}) {
  const hasKey = !!googleMapsKey();
  const mapEl = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const maps = useRef<GoogleMaps | null>(null);
  const map = useRef<GoogleMaps | null>(null);
  const marker = useRef<GoogleMaps | null>(null);
  const geocoder = useRef<GoogleMaps | null>(null);
  const [ready, setReady] = useState(false);
  const [locating, setLocating] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  // Move the pin, recentre, and reverse-geocode to a friendly label.
  function place(lat: number, lng: number, recenter = true) {
    const g = maps.current;
    if (!g || !map.current) return;
    const pos = { lat, lng };
    if (!marker.current) {
      marker.current = new g.Marker({
        map: map.current,
        position: pos,
        draggable: true,
      });
      marker.current.addListener("dragend", () => {
        const p = marker.current.getPosition();
        place(p.lat(), p.lng(), false);
      });
    } else {
      marker.current.setPosition(pos);
    }
    if (recenter) {
      map.current.panTo(pos);
      if (map.current.getZoom() < 11) map.current.setZoom(12);
    }
    if (!geocoder.current) geocoder.current = new g.Geocoder();
    geocoder.current.geocode(
      { location: pos },
      (results: unknown[], status: string) => {
        const label =
          status === "OK" && results?.[0]
            ? shortPlaceName(results[0] as Parameters<typeof shortPlaceName>[0])
            : "";
        onChange({ label: label || value, lat, lng });
      }
    );
  }

  // Init the map once the script is in.
  useEffect(() => {
    if (!hasKey) return;
    let cancelled = false;
    const p = loadGoogleMaps();
    if (!p) return;
    p.then((g: GoogleMaps) => {
      if (cancelled || !mapEl.current) return;
      maps.current = g;
      map.current = new g.Map(mapEl.current, {
        center: UK_CENTRE,
        zoom: 6,
        disableDefaultUI: true,
        zoomControl: true,
        clickableIcons: false,
      });
      map.current.addListener("click", (e: { latLng: { lat(): number; lng(): number } }) =>
        place(e.latLng.lat(), e.latLng.lng(), false)
      );

      // Places autocomplete on the text box.
      if (inputRef.current && g.places?.Autocomplete) {
        const ac = new g.places.Autocomplete(inputRef.current, {
          componentRestrictions: { country: "gb" },
          fields: ["geometry", "address_components", "formatted_address"],
        });
        ac.addListener("place_changed", () => {
          const pl = ac.getPlace();
          if (pl?.geometry?.location) {
            const lat = pl.geometry.location.lat();
            const lng = pl.geometry.location.lng();
            place(lat, lng);
          }
        });
      }
      setReady(true);
    }).catch(() => !cancelled && setMapError("Map couldn't load — type your location instead."));
    return () => {
      cancelled = true;
    };
    // place/onChange are stable enough for this one-time init.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasKey]);

  function useMyLocation() {
    if (!navigator.geolocation) {
      setMapError("Your browser won't share a location — type it in instead.");
      return;
    }
    setLocating(true);
    setMapError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        place(pos.coords.latitude, pos.coords.longitude);
      },
      () => {
        setLocating(false);
        setMapError("Couldn't get your location — type it in instead.");
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  return (
    <div>
      <div className="flex gap-2">
        <input
          ref={inputRef}
          className={inputCls}
          value={value}
          onChange={(e) => onChange({ label: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onEnter?.();
            }
          }}
          placeholder="e.g. Liverpool, or L1 8JQ"
        />
        {hasKey && (
          <button
            type="button"
            onClick={useMyLocation}
            disabled={locating}
            title="Use my current location"
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-xs font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
            </svg>
            {locating ? "Locating…" : "Locate me"}
          </button>
        )}
      </div>

      {/* Quick city chips (kept — a fast path, and the only path with no key) */}
      <div className="mt-3 flex flex-wrap gap-2">
        {["Liverpool", "Manchester", "Leeds", "Birmingham"].map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange({ label: c })}
            className="rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            {c}
          </button>
        ))}
      </div>

      {hasKey ? (
        <div className="relative mt-3">
          <div
            ref={mapEl}
            className="h-56 w-full overflow-hidden rounded-2xl border border-gray-200 bg-gray-50"
          />
          {!ready && !mapError && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-gray-400">
              Loading map…
            </div>
          )}
          <p className="mt-2 text-xs text-gray-400">
            Tap the map to drop a pin, drag it to fine-tune, or{" "}
            <button
              type="button"
              onClick={useMyLocation}
              className="font-medium underline decoration-dotted underline-offset-2"
              style={{ color: accent }}
            >
              use your location
            </button>
            .
          </p>
        </div>
      ) : (
        <p className="mt-3 text-xs text-gray-400">
          📍 Map pin &amp; auto-locate switch on once the maps key is set — for
          now just type it in.
        </p>
      )}

      {mapError && <p className="mt-2 text-xs text-amber-600">{mapError}</p>}
    </div>
  );
}
