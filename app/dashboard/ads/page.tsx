"use client";

import { useEffect, useState } from "react";
import { getUser } from "@/lib/session";
import { brandById, type Brand } from "@/lib/brands";
import { getPreviewBrandId, getPreviewAccent } from "@/lib/preview";

// All Ads — every ad running under the agent's tagged Meta campaign(s), as a
// gallery of the real creatives. Click one for its own figures.

interface AdFigures {
  impressions: number;
  clicks: number;
  spend: number;
  leads: number;
  cpl: number | null;
}

interface AdItem {
  id: string;
  name: string;
  status: string;
  imageUrl: string | null;
  figures: AdFigures | null;
}

const PRESETS = [
  { id: "last_7d", label: "7 days" },
  { id: "last_14d", label: "14 days" },
  { id: "last_30d", label: "30 days" },
  { id: "last_90d", label: "90 days" },
] as const;

export default function AllAdsPage() {
  const [brand, setBrand] = useState<Brand | null>(null);
  const [ads, setAds] = useState<AdItem[]>([]);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [preset, setPreset] = useState("last_30d");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<AdItem | null>(null);

  useEffect(() => {
    const u = getUser();
    if (!u) return;
    let b = brandById(getPreviewBrandId() ?? u.brandId) ?? brandById(u.brandId) ?? null;
    const pa = getPreviewAccent();
    if (b && pa) b = { ...b, accent: pa };
    setBrand(b);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/my/ads?preset=${preset}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        setConfigured(!!d?.configured);
        setAds(Array.isArray(d?.ads) ? d.ads : []);
      })
      .catch(() => !cancelled && setConfigured(false))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [preset]);

  if (!brand) return null;

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">All ads</h1>
          <p className="mt-2 text-gray-500">
            Every ad running for you right now — tap one to see how it&apos;s
            doing.
          </p>
        </div>
        {/* Date range */}
        <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white p-1 lg:border-gray-900/[0.13] lg:bg-transparent">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPreset(p.id)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                preset === p.id
                  ? "bg-gray-900 text-white"
                  : "text-gray-500 hover:bg-gray-50"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="mt-10 py-20 text-center text-sm text-gray-400">
          Loading your ads…
        </div>
      ) : !configured || ads.length === 0 ? (
        <div className="mt-10 rounded-3xl border border-dashed border-gray-300 py-20 text-center">
          <p className="text-lg font-semibold text-gray-700">
            Your ads will appear here
          </p>
          <p className="mt-1 text-sm text-gray-400">
            {configured
              ? "No ads found in your campaigns yet."
              : "As soon as your campaign is live and linked, every ad shows up here with its own figures."}
          </p>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {ads.map((ad) => (
            <button
              key={ad.id}
              onClick={() => setOpen(ad)}
              className="group rounded-2xl border border-gray-200 bg-white p-2 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md lg:rounded-xl lg:border-gray-900/[0.13] lg:bg-transparent lg:shadow-none lg:hover:scale-[1.015] lg:hover:bg-white/40 lg:hover:shadow-md"
            >
              {/* Image sits above, framed by the card's white margin */}
              <div
                className="relative aspect-square overflow-hidden rounded-xl"
                style={{
                  background: `radial-gradient(120% 120% at 15% 0%, ${brand.accent}, ${brand.accent}99 55%, rgba(0,0,0,0.55))`,
                }}
              >
                {ad.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={ad.imageUrl}
                    alt={ad.name}
                    className="absolute inset-0 h-full w-full object-contain transition duration-300 group-hover:scale-105"
                  />
                )}
                {/* Live/status badge — tucked inside the white-framed image */}
                <span
                  className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide backdrop-blur ${
                    ad.status === "ACTIVE"
                      ? "bg-green-500/90 text-white"
                      : "bg-black/40 text-white/90"
                  }`}
                >
                  {ad.status === "ACTIVE" ? "● Live" : ad.status.toLowerCase()}
                </span>
              </div>
              {/* Name + figures in the white tab underneath */}
              <div className="px-1 pb-0.5 pt-2">
                <p className="truncate text-sm font-semibold text-gray-900">
                  {ad.name}
                </p>
                {ad.figures && (
                  <p className="mt-0.5 text-xs text-gray-400">
                    {ad.figures.leads} lead{ad.figures.leads === 1 ? "" : "s"} · £
                    {ad.figures.spend.toLocaleString("en-GB", {
                      maximumFractionDigits: 0,
                    })}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Ad detail — the individual figures */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4 backdrop-blur-sm sm:p-8"
          onClick={() => setOpen(null)}
        >
          <div
            className="modal-pop max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-3 shadow-2xl lg:rounded-xl lg:bg-[#f4f4f5]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* The whole creative, squared, with a white margin all the way
                round — object-contain so nothing's cropped out. */}
            <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-gray-50">
              {open.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={open.imageUrl}
                  alt={open.name}
                  className="absolute inset-0 h-full w-full object-contain"
                />
              ) : (
                <div
                  className="absolute inset-0"
                  style={{
                    background: `radial-gradient(120% 120% at 15% 0%, ${brand.accent}, rgba(0,0,0,0.6))`,
                  }}
                />
              )}
              <button
                onClick={() => setOpen(null)}
                className="absolute right-2 top-2 rounded-lg bg-white/80 p-1 text-gray-500 backdrop-blur hover:bg-white"
                aria-label="Close"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <div className="p-3 sm:p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold leading-tight">
                    {open.name}
                  </h2>
                  <p className="mt-0.5 text-xs text-gray-400">
                    {PRESETS.find((p) => p.id === preset)?.label} ·{" "}
                    {open.status === "ACTIVE" ? "live now" : open.status.toLowerCase()}
                  </p>
                </div>
              </div>

              {open.figures ? (
                <div className="mt-5 grid grid-cols-2 gap-3">
                  {[
                    {
                      label: "Leads",
                      value: String(open.figures.leads),
                    },
                    {
                      label: "Spend",
                      value: `£${open.figures.spend.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`,
                    },
                    {
                      label: "Impressions",
                      value: open.figures.impressions.toLocaleString("en-GB"),
                    },
                    {
                      label: "Clicks",
                      value: open.figures.clicks.toLocaleString("en-GB"),
                    },
                    {
                      label: "Cost per lead",
                      value:
                        open.figures.cpl === null
                          ? "—"
                          : `£${open.figures.cpl.toFixed(2)}`,
                    },
                  ].map((s) => (
                    <div
                      key={s.label}
                      className="rounded-xl border border-gray-100 p-3.5"
                    >
                      <p className="text-xs text-gray-400">{s.label}</p>
                      <p
                        className="mt-0.5 text-2xl font-semibold tracking-tight"
                        style={s.label === "Leads" ? { color: brand.accent } : undefined}
                      >
                        {s.value}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-5 rounded-xl bg-gray-50 p-4 text-sm text-gray-500">
                  No figures for this range yet — they&apos;ll fill in as the
                  ad delivers.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
