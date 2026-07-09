"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  getUser,
  fetchLeads,
  approveCampaign,
  sendCampaignFeedback,
} from "@/lib/session";
import { brandById, type Brand } from "@/lib/brands";
import { packageById } from "@/lib/packages";
import { ONBOARDING_STAGES, stageIndex } from "@/lib/onboarding";
import Confetti from "@/components/Confetti";
import type { UserProfile, Lead } from "@/lib/types";

// A random property photo for the "Current ad" tile (falls back to a brand
// gradient if it can't load).
const AD_PHOTO =
  "https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=800&q=70";

// Stat-row icons (stroke SVGs) keyed by label.
const STAT_ICON: Record<string, string> = {
  Impressions: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z",
  Clicks: "M3 3l7 17 2.5-7.5L20 10z",
  Leads:
    "M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4z",
  Converted: "M20 6L9 17l-5-5",
};

// Translucent "glaze" tile — barely see-through with a soft brand-colour fade
// in the top-right so the page background reads through it.
function glaze(accent: string) {
  return {
    className:
      "relative overflow-hidden rounded-3xl border border-white/60 backdrop-blur-xl shadow-[0_12px_36px_-18px_rgba(0,0,0,0.22)]",
    style: {
      background: `linear-gradient(155deg, rgba(255,255,255,0.62), rgba(255,255,255,0.26)), radial-gradient(130% 110% at 100% 0%, ${accent}26, transparent 55%)`,
    } as React.CSSProperties,
  };
}

export default function DashboardOverview() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [feedbackText, setFeedbackText] = useState("");
  const [reviewStatus, setReviewStatus] = useState("");
  const [approving, setApproving] = useState(false);

  async function approve() {
    if (approving) return;
    setApproving(true);
    const u = await approveCampaign();
    setApproving(false);
    if (u) setUser(u);
  }
  async function submitFeedback() {
    const text = feedbackText.trim();
    if (!text) return;
    const u = await sendCampaignFeedback(text);
    if (u) {
      setUser(u);
      setFeedbackText("");
      setReviewStatus("Sent to the team ✓");
      setTimeout(() => setReviewStatus(""), 3000);
    }
  }

  useEffect(() => {
    const u = getUser();
    if (!u) return;
    setUser(u);
    setBrand(brandById(u.brandId) ?? null);
    fetchLeads().then(setLeads);
  }, []);

  const weekly = useMemo(() => {
    const WEEKS = 6;
    const WEEK = 7 * 24 * 3600 * 1000;
    const now = Date.now();
    const buckets = Array(WEEKS).fill(0) as number[];
    for (const l of leads) {
      const wi = Math.floor((now - new Date(l.receivedAt).getTime()) / WEEK);
      if (wi >= 0 && wi < WEEKS) buckets[WEEKS - 1 - wi]++;
    }
    return buckets;
  }, [leads]);

  const topAd = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of leads)
      if (l.adName) counts.set(l.adName, (counts.get(l.adName) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }, [leads]);

  if (!user || !brand) return null;

  const pkg = packageById(user.packageId);
  const converted = leads.filter(
    (l) => l.stage === "converted" || l.stage === "pushed"
  ).length;
  const untouched = leads.filter((l) => l.stage === "new");
  const convRate = leads.length ? Math.round((converted / leads.length) * 100) : 0;

  const curStage = stageIndex(user.onboardingStage);
  const isLive = user.onboardingStage === "live";
  const campaignSteps = ONBOARDING_STAGES.map((s, i) => ({
    label: s.label,
    done: i < curStage || isLive,
    current: i === curStage && !isLive && user.onboardingStage !== "paused",
  }));
  const doneCount = campaignSteps.filter((s) => s.done).length;

  const stats = [
    { label: "Impressions", value: "—" },
    { label: "Clicks", value: "—" },
    { label: "Leads", value: String(leads.length) },
    { label: "Converted", value: String(converted) },
  ];

  const isReview = user.onboardingStage === "review" && !user.campaignApproved;
  const maxWeek = Math.max(1, ...weekly);
  const g = glaze(brand.accent);

  return (
    <div className="w-full">
      {/* Header: greeting left, stats stripped down and pushed right */}
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-sm text-gray-400">
            {new Date().toLocaleDateString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Morning, {user.name.split(" ")[0]} 👋
          </h1>
        </div>

        <div className="flex items-end gap-7 sm:gap-9">
          {stats.map((s) => (
            <div key={s.label} className="flex items-center gap-2.5">
              <svg
                className="h-5 w-5 shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                viewBox="0 0 24 24"
                style={{ color: brand.accent }}
              >
                <path d={STAT_ICON[s.label]} />
                {s.label === "Impressions" && <circle cx="12" cy="12" r="3" />}
              </svg>
              <div>
                <p className="text-3xl font-semibold leading-none tracking-tight">
                  {s.value}
                </p>
                <p className="mt-1 text-xs text-gray-500">{s.label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Review & approve — surfaced full-width only while awaiting sign-off */}
      {isReview && (
        <section
          className="mt-6 rounded-3xl border-2 bg-white/70 p-6 backdrop-blur-xl"
          style={{ borderColor: `${brand.accent}55` }}
        >
          {(user.campaignAssets ?? []).length > 0 && (
            <div className="mb-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
                Your creatives
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {(user.campaignAssets ?? []).map((a) =>
                  a.type === "image" ? (
                    <a key={a.id} href={a.url} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={a.url}
                        alt={a.caption ?? "Creative"}
                        className="aspect-square w-full rounded-xl border border-gray-200 object-cover transition hover:opacity-90"
                      />
                      {a.caption && (
                        <p className="mt-1 text-xs text-gray-500">{a.caption}</p>
                      )}
                    </a>
                  ) : (
                    <div key={a.id}>
                      <video
                        src={a.url}
                        controls
                        className="aspect-square w-full rounded-xl border border-gray-200 object-cover"
                      />
                      {a.caption && (
                        <p className="mt-1 text-xs text-gray-500">{a.caption}</p>
                      )}
                    </div>
                  )
                )}
              </div>
            </div>
          )}
          <p className="text-sm font-semibold text-gray-900">
            Your creatives are ready to review
          </p>
          <p className="mt-1 text-sm text-gray-500">
            Happy with everything? Give it the final sign-off. Spotted something
            — a typo, a colour, the wrong brand — pop it below and we&apos;ll fix
            it before it goes live.
          </p>
          <textarea
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            rows={2}
            placeholder="Any changes before we go live? (optional)"
            className="mt-3 w-full rounded-xl border border-gray-200 bg-white p-3 text-sm outline-none focus:border-gray-900"
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={approve}
              disabled={approving}
              className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
              style={{ backgroundColor: brand.accent }}
            >
              {approving ? "Approving…" : "Approve & go live"}
            </button>
            <button
              onClick={submitFeedback}
              disabled={!feedbackText.trim()}
              className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
            >
              Send feedback
            </button>
            {reviewStatus && (
              <span className="text-xs text-gray-500">{reviewStatus}</span>
            )}
          </div>
        </section>
      )}

      {/* Bento — square glaze tiles, Onboarding Tracker spans both rows */}
      <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Current ad — photo, top-left */}
        <div
          className="relative aspect-square overflow-hidden rounded-3xl border border-white/60 shadow-[0_12px_36px_-18px_rgba(0,0,0,0.22)]"
          style={{
            background: `linear-gradient(135deg, ${brand.accent}, ${brand.accent}aa)`,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={AD_PHOTO}
            alt="Current ad"
            className="absolute inset-0 h-full w-full object-cover"
            onError={(e) => (e.currentTarget.style.display = "none")}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-5 text-white">
            <p className="text-[11px] font-medium uppercase tracking-wide text-white/70">
              Current ad
            </p>
            <p className="mt-1 truncate font-semibold">
              {topAd ?? "In production"}
            </p>
            <p className="text-xs text-white/70">
              £{pkg?.adSpend?.toLocaleString("en-GB")}/mo
            </p>
          </div>
        </div>

        {/* Leads uncontacted */}
        <div className={`${g.className} aspect-square p-5`} style={g.style}>
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Uncontacted</h2>
              <span
                className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
                style={{ backgroundColor: brand.accent }}
              >
                {untouched.length}
              </span>
            </div>
            <p className="mt-3 text-5xl font-semibold tracking-tight">
              {untouched.length}
            </p>
            <p className="text-xs text-gray-500">leads to action</p>
            <div className="mt-auto space-y-1">
              {untouched.slice(0, 2).map((l) => (
                <Link
                  key={l.id}
                  href={`/dashboard/leads?lead=${l.id}`}
                  className="block truncate text-xs font-medium text-gray-600 hover:text-gray-900"
                >
                  {l.name}
                </Link>
              ))}
              {untouched.length === 0 && (
                <p className="text-xs text-gray-400">All caught up 🎉</p>
              )}
            </div>
          </div>
        </div>

        {/* Recent leads */}
        <div className={`${g.className} aspect-square p-5`} style={g.style}>
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Recent leads</h2>
              <Link
                href="/dashboard/leads"
                className="text-xs font-medium hover:underline"
                style={{ color: brand.accent }}
              >
                All →
              </Link>
            </div>
            <div className="mt-3 flex-1 space-y-2.5 overflow-hidden">
              {leads.slice(0, 3).map((lead) => (
                <Link
                  key={lead.id}
                  href={`/dashboard/leads?lead=${lead.id}`}
                  className="block"
                >
                  <p className="truncate text-sm font-medium">{lead.name}</p>
                  <p className="truncate text-[11px] capitalize text-gray-400">
                    {lead.stage === "converted" || lead.stage === "pushed"
                      ? brand.conversionLabel
                      : `via ${lead.source}`}
                  </p>
                </Link>
              ))}
              {leads.length === 0 && (
                <p className="text-xs text-gray-400">
                  Leads appear here once ads are live.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Onboarding Tracker — dark, spans both rows on the right */}
        <div
          className="relative overflow-hidden rounded-3xl bg-gray-900 p-6 text-white shadow-[0_12px_36px_-18px_rgba(0,0,0,0.3)] lg:col-start-4 lg:row-span-2 lg:row-start-1"
        >
          <Confetti fire={isLive} />
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-semibold">Onboarding tracker</h2>
              <p className="mt-0.5 text-xs text-white/50">
                {pkg?.name} package · £{pkg?.adSpend}/mo
              </p>
            </div>
            <span
              className="rounded-full px-2.5 py-1 text-xs font-semibold"
              style={
                isLive
                  ? { backgroundColor: "#DCFCE7", color: "#15803D" }
                  : { backgroundColor: brand.accent, color: "white" }
              }
            >
              {isLive
                ? "🎉 Live"
                : user.onboardingStage === "paused"
                  ? "Paused"
                  : `${doneCount}/${campaignSteps.length}`}
            </span>
          </div>

          <ol className="mt-6 space-y-2">
            {campaignSteps.map((step, i) => (
              <li
                key={step.label}
                className={`flex items-center gap-3 rounded-xl px-3 py-3 ${
                  step.current ? "bg-white/10" : ""
                }`}
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    step.done ? "text-white" : "text-white/50"
                  }`}
                  style={
                    step.done
                      ? { backgroundColor: brand.accent }
                      : step.current
                        ? { boxShadow: `inset 0 0 0 2px ${brand.accent}` }
                        : { boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.2)" }
                  }
                >
                  {step.done ? "✓" : i + 1}
                </span>
                <span
                  className={`text-sm ${
                    step.done
                      ? "text-white/80"
                      : step.current
                        ? "font-medium text-white"
                        : "text-white/50"
                  }`}
                >
                  {step.label}
                </span>
                {step.current && (
                  <span
                    className="ml-auto text-[11px] font-medium"
                    style={{ color: brand.accent }}
                  >
                    Now
                  </span>
                )}
              </li>
            ))}
          </ol>

          {!isLive && (
            <Link
              href="/dashboard/grow"
              className="mt-5 inline-block text-xs font-medium text-white/60 hover:text-white"
            >
              Increase your ad spend →
            </Link>
          )}
        </div>

        {/* Conversion rate — extra metric, bottom-left */}
        <div className={`${g.className} aspect-square p-5`} style={g.style}>
          <div className="flex h-full flex-col justify-between">
            <h2 className="text-sm font-semibold">Conversion rate</h2>
            <div>
              <p
                className="text-5xl font-semibold tracking-tight"
                style={{ color: brand.accent }}
              >
                {convRate}%
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {converted} of {leads.length} lead{leads.length === 1 ? "" : "s"}{" "}
                {brand.conversionLabel.toLowerCase()}
              </p>
            </div>
          </div>
        </div>

        {/* Leads per week — wide, second row */}
        <div
          className={`${g.className} p-6 sm:col-span-2`}
          style={g.style}
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold">Leads per week</h2>
              <p className="mt-0.5 text-xs text-gray-400">Last 6 weeks</p>
            </div>
            <p className="text-2xl font-semibold tracking-tight">
              {leads.length}
              <span className="ml-1 text-xs font-normal text-gray-400">
                total
              </span>
            </p>
          </div>
          <div className="mt-5 flex h-28 gap-3">
            {weekly.map((n, i) => {
              const last = i === weekly.length - 1;
              return (
                <div
                  key={i}
                  className="flex h-full flex-1 flex-col items-center gap-2"
                >
                  <div className="flex w-full flex-1 items-end">
                    <div
                      className="relative w-full rounded-lg transition-all"
                      style={{
                        height: `${Math.max(4, (n / maxWeek) * 100)}%`,
                        backgroundColor: last
                          ? brand.accent
                          : `${brand.accent}33`,
                      }}
                      title={`${n} lead${n === 1 ? "" : "s"}`}
                    >
                      <span
                        className={`absolute -top-5 left-1/2 -translate-x-1/2 text-[11px] font-semibold ${
                          n === 0 ? "hidden" : ""
                        }`}
                        style={{ color: last ? brand.accent : "#9ca3af" }}
                      >
                        {n}
                      </span>
                    </div>
                  </div>
                  <span className="text-[11px] text-gray-400">
                    {last ? "This wk" : `${weekly.length - 1 - i}w`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
