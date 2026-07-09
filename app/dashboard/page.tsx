"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  getUser,
  fetchLeads,
  sendCampaignFeedback,
  moveLeadStage,
  pushLeadToCrm,
  resetRexLead,
  addLeadNote,
  bookLeadAppointment,
  cancelLeadAppointment,
} from "@/lib/session";
import { brandById, type Brand } from "@/lib/brands";
import { getPreviewBrandId, getPreviewAccent } from "@/lib/preview";
import { packageById } from "@/lib/packages";
import { ONBOARDING_STAGES, stageIndex } from "@/lib/onboarding";
import Confetti from "@/components/Confetti";
import { LeadModal } from "@/app/dashboard/leads/lead-modal";
import type { UserProfile, Lead, LeadStage } from "@/lib/types";

// A brief + typical timescale for each onboarding stage — shown when a step
// is expanded on the sign-up tracker.
const STAGE_DETAIL: { blurb: string; time: string }[] = [
  {
    blurb:
      "You've created your account and chosen your package. Nothing to do here — you're in.",
    time: "Instant",
  },
  {
    blurb:
      "Our design team builds your personalised ad creatives around your goal, brand and local area.",
    time: "Typically 2–3 working days",
  },
  {
    blurb:
      "You review the finished creatives and give them the final sign-off — or ask for tweaks before they go live.",
    time: "About a day, once creatives land",
  },
  {
    blurb:
      "Your ads are live and running. Leads start dropping straight into your funnel.",
    time: "Ongoing from launch",
  },
];

// Personalised-ad tagline per brand — a stand-in for the real creative
// ("This is James — see how I can sell more homes in Gloucestershire").
const AD_PITCH: Record<string, (area: string) => string> = {
  property: (a) => `See how I can sell more homes in ${a}`,
  lettings: (a) => `Let your property faster across ${a}`,
  mortgage: (a) => `Get the right mortgage sorted in ${a}`,
  recruitment: (a) => `See how I place top talent across ${a}`,
  commercial: (a) => `Find your next commercial space in ${a}`,
  fineandcountry: (a) => `Selling premium homes across ${a}`,
  auction: (a) => `Sell fast at auction in ${a}`,
};

// Stat-row icons (stroke SVGs) keyed by label.
const STAT_ICON: Record<string, string> = {
  Impressions: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z",
  Clicks: "M3 3l7 17 2.5-7.5L20 10z",
  Leads:
    "M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4z",
  Converted: "M20 6L9 17l-5-5",
};

// Translucent "glaze" tile — a light frost that lets the page's background
// glow read straight through it (the gradient lives on the page, not the box).
function glaze() {
  return {
    className:
      "relative overflow-hidden rounded-3xl border border-white/40 backdrop-blur-xl shadow-[0_2px_8px_-2px_rgba(0,0,0,0.12),inset_0_1px_1px_rgba(255,255,255,0.7),inset_0_0_30px_rgba(0,0,0,0.08)]",
    style: { background: "rgba(255,255,255,0.2)" } as React.CSSProperties,
  };
}

export default function DashboardOverview() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [feedbackText, setFeedbackText] = useState("");
  const [reviewStatus, setReviewStatus] = useState("");
  const [openStep, setOpenStep] = useState<number | null>(null);
  const [hoverLead, setHoverLead] = useState<string | null>(null);
  const [openWeek, setOpenWeek] = useState<number | null>(null);
  const [leadsLoaded, setLeadsLoaded] = useState(false);
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);
  const [pushingId, setPushingId] = useState<string | null>(null);
  // The agent's OWN live Meta figures (their tagged campaigns, last 30 days).
  // Null until the admin tags a campaign id and the brand's Meta is connected.
  const [myMeta, setMyMeta] = useState<{
    impressions: number;
    clicks: number;
    spend: number;
    leads: number;
  } | null>(null);
  // The actual live ad's creative image, when Meta can give us one — swaps
  // the "Current ad" mock for the real thing.
  const [myCreative, setMyCreative] = useState<{
    adName: string;
    imageUrl: string;
  } | null>(null);

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

  // Lead actions for the pop-out modal (mirrors the leads page, keeping the
  // overview's own leads state in sync).
  function overviewStage(leadId: string, stage: LeadStage) {
    setLeads((prev) =>
      prev.map((l) =>
        l.id === leadId
          ? {
              ...l,
              stage,
              history: [...l.history, { stage, at: new Date().toISOString() }],
            }
          : l
      )
    );
    moveLeadStage(leadId, stage);
  }
  async function overviewAddNote(leadId: string, text: string) {
    const updated = await addLeadNote(leadId, text);
    if (updated) setLeads((prev) => prev.map((l) => (l.id === leadId ? updated : l)));
  }
  async function overviewBook(leadId: string, at: string) {
    const updated = await bookLeadAppointment(leadId, at);
    if (updated) setLeads((prev) => prev.map((l) => (l.id === leadId ? updated : l)));
  }
  async function overviewCancel(leadId: string) {
    const updated = await cancelLeadAppointment(leadId);
    if (updated) setLeads((prev) => prev.map((l) => (l.id === leadId ? updated : l)));
  }
  async function overviewPush(lead: Lead) {
    if (!brand) return;
    if (brand.crmName !== "Atlas") {
      overviewStage(lead.id, "pushed");
      return;
    }
    setPushingId(lead.id);
    const res = await pushLeadToCrm(lead.id);
    setPushingId(null);
    if (res.ok)
      setLeads((prev) =>
        prev.map((l) =>
          l.id === lead.id
            ? {
                ...l,
                stage: "pushed" as LeadStage,
                history: [
                  ...l.history,
                  { stage: "pushed" as LeadStage, at: new Date().toISOString() },
                ],
              }
            : l
        )
      );
  }

  async function overviewRexReset(lead: Lead) {
    const res = await resetRexLead(lead.id);
    if (res.ok && res.lead) {
      setLeads((prev) => prev.map((l) => (l.id === lead.id ? res.lead! : l)));
    }
  }

  useEffect(() => {
    const u = getUser();
    if (!u) return;
    setUser(u);
    let b = brandById(getPreviewBrandId() ?? u.brandId) ?? brandById(u.brandId) ?? null;
    const pa = getPreviewAccent();
    if (b && pa) b = { ...b, accent: pa };
    setBrand(b);
    fetchLeads().then((ls) => {
      setLeads(ls);
      setLeadsLoaded(true);
    });
    // The agent's own live campaign figures, once the admin has tagged their
    // Meta campaign id(s). Quietly stays null until then.
    fetch("/api/my/meta", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.configured && d?.snapshot) setMyMeta(d.snapshot);
        if (d?.creative) setMyCreative(d.creative);
      })
      .catch(() => {});
  }, []);

  // Leads bucketed into the last 6 weeks (oldest left, this week right) — the
  // actual leads, so a week can be clicked open to list its names.
  const weeklyBuckets = useMemo(() => {
    const WEEKS = 6;
    const WEEK = 7 * 24 * 3600 * 1000;
    const now = Date.now();
    const buckets: Lead[][] = Array.from({ length: WEEKS }, () => []);
    for (const l of leads) {
      const wi = Math.floor((now - new Date(l.receivedAt).getTime()) / WEEK);
      if (wi >= 0 && wi < WEEKS) buckets[WEEKS - 1 - wi].push(l);
    }
    return buckets;
  }, [leads]);
  const weekly = weeklyBuckets.map((b) => b.length);

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

  // Ad spend running total. Real Meta spend for the agent's own campaign(s)
  // when the admin has tagged them; otherwise paced against the monthly cap
  // by day-of-month — an estimate, labelled as such.
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const cap = pkg?.adSpend ?? 0;
  const spendIsLive = myMeta !== null;
  const spent = spendIsLive
    ? Math.round(myMeta.spend)
    : Math.min(cap, Math.round((cap / daysInMonth) * now.getDate()));
  const spendLeft = Math.max(0, cap - spent);
  const spendPct = cap > 0 ? Math.min(100, Math.round((spent / cap) * 100)) : 0;

  const openLead = openLeadId
    ? leads.find((l) => l.id === openLeadId) ?? null
    : null;

  const curStage = stageIndex(user.onboardingStage);
  const isLive = user.onboardingStage === "live";
  const campaignSteps = ONBOARDING_STAGES.map((s, i) => ({
    label: s.label,
    done: i < curStage || isLive,
    current: i === curStage && !isLive && user.onboardingStage !== "paused",
  }));
  const doneCount = campaignSteps.filter((s) => s.done).length;

  const stats = [
    {
      label: "Impressions",
      value: myMeta ? myMeta.impressions.toLocaleString("en-GB") : "—",
    },
    {
      label: "Clicks",
      value: myMeta ? myMeta.clicks.toLocaleString("en-GB") : "—",
    },
    { label: "Leads", value: String(leads.length) },
    { label: "Converted", value: String(converted) },
  ];

  // The customer sees their creatives at review — no approval step, we
  // handle go-live ourselves.
  const isReview = user.onboardingStage === "review";
  const maxWeek = Math.max(1, ...weekly);
  const pct = Math.round((doneCount / campaignSteps.length) * 100);
  const g = glaze();

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

      {/* Campaign review — the customer just SEES their creatives here (no
          sign-off needed); they can send feedback if something's off. */}
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
            {(user.campaignAssets ?? []).length > 0
              ? "Here's your campaign — going live soon"
              : "Your campaign is in final review"}
          </p>
          <p className="mt-1 text-sm text-gray-500">
            Spotted something — a typo, a colour, the wrong brand? Pop it below
            and we&apos;ll fix it before it goes live. Otherwise, sit tight —
            we&apos;ll take it from here.
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
        {/* Current ad — the REAL live creative straight from Meta when the
            campaign's tagged; the personalised mock until then. */}
        {myCreative ? (
          <div className="relative aspect-square overflow-hidden rounded-3xl border border-white/10 text-white shadow-[0_2px_8px_-2px_rgba(0,0,0,0.14)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={myCreative.imageUrl}
              alt={myCreative.adName}
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-black/30" />
            <div className="absolute inset-x-0 top-0 flex items-start justify-between p-5">
              <span className="rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide backdrop-blur">
                Current ad
              </span>
              <span className="flex items-center gap-1 rounded-full bg-green-500/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide backdrop-blur">
                ● Live
              </span>
            </div>
            <div className="absolute inset-x-0 bottom-0 p-5">
              <p className="truncate font-semibold">{myCreative.adName}</p>
              <p className="text-xs text-white/70">
                £{pkg?.adSpend?.toLocaleString("en-GB")}/mo
              </p>
            </div>
          </div>
        ) : (
          <div
            className="relative aspect-square overflow-hidden rounded-3xl border border-white/10 p-5 text-white shadow-[0_2px_8px_-2px_rgba(0,0,0,0.14),inset_0_0_60px_rgba(0,0,0,0.35)]"
            style={{
              background: `radial-gradient(120% 120% at 15% 0%, ${brand.accent}, ${brand.accent}cc 45%, rgba(0,0,0,0.55)), ${brand.accent}`,
            }}
          >
            <div className="flex h-full flex-col">
              <div className="flex items-start justify-between">
                <span className="rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide backdrop-blur">
                  Current ad
                </span>
                <span className="text-xs font-medium text-white/80">
                  £{pkg?.adSpend?.toLocaleString("en-GB")}/mo
                </span>
              </div>

              <div className="mt-auto">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/20 text-lg font-bold ring-2 ring-white/40">
                    {user.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={user.photo}
                        alt={user.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      user.name.charAt(0).toUpperCase()
                    )}
                  </div>
                  <p className="text-sm font-medium text-white/85">
                    This is {user.name.split(" ")[0]}
                  </p>
                </div>
                <p className="mt-3 text-lg font-semibold leading-snug">
                  {(AD_PITCH[brand.id] ?? AD_PITCH.property)(
                    user.location || "your area"
                  )}
                </p>
                <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-semibold text-gray-900">
                  Learn more →
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Leads uncontacted — celebrates (in black) with a confetti pop once
            the leads have loaded and there are none to action */}
        <div className={`${g.className} aspect-square p-5`} style={g.style}>
          {leadsLoaded && untouched.length === 0 ? (
            <div className="relative flex h-full flex-col items-center justify-center text-center">
              <Confetti fire />
              <p className="fade-up text-2xl font-bold tracking-tight text-gray-900">
                All caught up
              </p>
              <p className="fade-up mt-1 text-xs text-gray-500">
                No leads to action 🎉
              </p>
            </div>
          ) : (
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Uncontacted</h2>
                <span className="rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-semibold text-white">
                  {untouched.length}
                </span>
              </div>
              {/* Bigger, clearer rows — this stays readable for the handful of
                  leads waiting at once; beyond 4 it folds the rest into a link. */}
              <div className="mt-3 flex-1 space-y-2 overflow-hidden">
                {untouched.slice(0, 4).map((l) => (
                  <button
                    key={l.id}
                    onClick={() => setOpenLeadId(l.id)}
                    className="flex w-full items-center gap-2.5 rounded-xl bg-red-50/80 px-2.5 py-2 text-left transition hover:bg-red-100/80"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-500 text-sm font-bold text-white">
                      {l.name.charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900">
                        {l.name}
                      </p>
                      <p className="truncate text-[11px] capitalize text-gray-500">
                        via {l.source}
                      </p>
                    </div>
                  </button>
                ))}
                {untouched.length > 4 && (
                  <Link
                    href="/dashboard/leads"
                    className="block pt-0.5 text-center text-xs font-medium text-gray-400 hover:text-gray-700"
                  >
                    +{untouched.length - 4} more →
                  </Link>
                )}
              </div>
            </div>
          )}
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
            <div className="mt-3 flex-1 space-y-1">
              {leads.slice(0, 3).map((lead) => {
                const dim = hoverLead !== null && hoverLead !== lead.id;
                const active = hoverLead === lead.id;
                return (
                  <button
                    key={lead.id}
                    onClick={() => setOpenLeadId(lead.id)}
                    onMouseEnter={() => setHoverLead(lead.id)}
                    onMouseLeave={() => setHoverLead(null)}
                    className={`-mx-2 block w-full rounded-lg px-2 py-1 text-left transition duration-200 ${
                      dim ? "opacity-40 blur-[1.5px]" : "opacity-100 blur-0"
                    } ${active ? "scale-[1.04] bg-white/50" : ""}`}
                  >
                    <p className="truncate text-sm font-medium">{lead.name}</p>
                    <p className="truncate text-[11px] capitalize text-gray-400">
                      {lead.stage === "converted" || lead.stage === "pushed"
                        ? brand.conversionLabel
                        : `via ${lead.source}`}
                    </p>
                  </button>
                );
              })}
              {leads.length === 0 && (
                <p className="text-xs text-gray-400">
                  Leads appear here once ads are live.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Onboarding Tracker — glazed outer with a dark inner card holding the
            sign-up steps (a rectangle within a rectangle), spans both rows */}
        <div
          className={`${g.className} flex flex-col lg:col-start-4 lg:row-span-2 lg:row-start-1`}
          style={g.style}
        >
          <div className="px-5 pt-5">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-semibold">Onboarding tracker</h2>
                <p className="mt-0.5 text-xs text-gray-500">
                  {pkg?.name} package
                </p>
              </div>
              <span
                className="text-2xl font-semibold tracking-tight"
                style={{ color: brand.accent }}
              >
                {isLive ? "100%" : `${pct}%`}
              </span>
            </div>

            {/* progress bar */}
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/5">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${isLive ? 100 : pct}%`,
                  backgroundColor: brand.accent,
                }}
              />
            </div>
          </div>

          {/* Dark-grey sign-up card — edge-to-edge, filling the tile */}
          <div className="relative mt-4 flex flex-1 flex-col overflow-hidden rounded-t-2xl bg-neutral-800 p-5 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.07),inset_0_0_34px_rgba(0,0,0,0.4)]">
            <Confetti fire={isLive} />
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Sign-up process</p>
              <span
                className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
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

            <ol className="mt-4 space-y-1">
              {campaignSteps.map((step, i) => {
                const open = openStep === i;
                return (
                  <li key={step.label}>
                    <button
                      onClick={() => setOpenStep(open ? null : i)}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                        step.current || open
                          ? "bg-white/10"
                          : "hover:bg-white/5"
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
                              : {
                                  boxShadow:
                                    "inset 0 0 0 1px rgba(255,255,255,0.2)",
                                }
                        }
                      >
                        {step.done ? "✓" : i + 1}
                      </span>
                      <span
                        className={`flex-1 text-sm ${
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
                          className="text-[11px] font-medium"
                          style={{ color: brand.accent }}
                        >
                          Now
                        </span>
                      )}
                      <svg
                        className={`h-4 w-4 shrink-0 text-white/40 transition-transform ${
                          open ? "rotate-180" : ""
                        }`}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        viewBox="0 0 24 24"
                      >
                        <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    {/* Expandable brief + timescale */}
                    <div
                      className={`grid transition-all duration-300 ${
                        open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                      }`}
                    >
                      <div className="overflow-hidden">
                        <div className="pb-2 pl-[52px] pr-3 pt-1">
                          <p className="text-xs leading-relaxed text-white/60">
                            {STAGE_DETAIL[i].blurb}
                          </p>
                          <p className="mt-1.5 text-[11px] font-medium text-white/40">
                            ⏱ {STAGE_DETAIL[i].time}
                          </p>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>

            <div className="mt-auto pt-4">
              {!isLive && (
                <Link
                  href="/dashboard/grow"
                  className="block text-xs font-medium text-white/60 hover:text-white"
                >
                  Increase your ad spend →
                </Link>
              )}
              <div className="mt-3 border-t border-white/10 pt-3">
                <p className="text-[11px] text-white/50">Current ad spend</p>
                <p className="text-lg font-semibold">
                  £{pkg?.adSpend?.toLocaleString("en-GB")}
                  <span className="text-xs font-normal text-white/50">/mo</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Ad spend running total — the glance-and-go view of budget left */}
        <div className={`${g.className} aspect-square p-5`} style={g.style}>
          <div className="flex h-full flex-col justify-between">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Ad spend</h2>
              <span
                className={`text-[10px] font-medium uppercase tracking-wide ${
                  spendIsLive ? "text-green-600" : "text-gray-400"
                }`}
              >
                {spendIsLive ? "● Live" : "Est. pace"}
              </span>
            </div>
            <div>
              <p
                className="text-4xl font-semibold tracking-tight"
                style={{ color: brand.accent }}
              >
                £{spent}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {spendIsLive
                  ? `of £${cap} · last 30 days`
                  : `of £${cap} this month`}
              </p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/5">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${spendPct}%`, backgroundColor: brand.accent }}
                />
              </div>
              <p className="mt-2.5 text-xs font-medium text-gray-700">
                £{spendLeft} left · {leads.length} lead
                {leads.length === 1 ? "" : "s"} so far
              </p>
            </div>
          </div>
        </div>

        {/* Leads per week — wide; click a bar to list that week's leads below */}
        <div
          className={`${g.className} flex flex-col p-5 sm:col-span-2`}
          style={g.style}
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold">Leads per week</h2>
              <p className="mt-0.5 text-xs text-gray-400">
                {openWeek === null
                  ? "Tap a bar to see the leads"
                  : openWeek === weekly.length - 1
                    ? "This week"
                    : `${weekly.length - 1 - openWeek} week${
                        weekly.length - 1 - openWeek === 1 ? "" : "s"
                      } ago`}
              </p>
            </div>
            <p className="text-2xl font-semibold tracking-tight">
              {leads.length}
              <span className="ml-1 text-xs font-normal text-gray-400">
                total
              </span>
            </p>
          </div>

          <div className="mt-4 flex flex-1 gap-3">
            {weekly.map((n, i) => {
              const last = i === weekly.length - 1;
              const sel = openWeek === i;
              return (
                <button
                  key={i}
                  onClick={() => setOpenWeek(sel ? null : i)}
                  className="flex h-full flex-1 flex-col items-center gap-2"
                >
                  <div className="flex w-full flex-1 items-end">
                    <div
                      className="relative w-full rounded-lg transition-all"
                      style={{
                        height: `${Math.max(4, (n / maxWeek) * 100)}%`,
                        backgroundColor:
                          sel || (openWeek === null && last)
                            ? brand.accent
                            : `${brand.accent}33`,
                        boxShadow: sel ? `0 0 0 2px ${brand.accent}55` : undefined,
                      }}
                    >
                      <span
                        className={`absolute -top-5 left-1/2 -translate-x-1/2 text-[11px] font-semibold ${
                          n === 0 ? "hidden" : ""
                        }`}
                        style={{ color: sel || last ? brand.accent : "#9ca3af" }}
                      >
                        {n}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`text-[11px] ${
                      sel ? "font-semibold text-gray-700" : "text-gray-400"
                    }`}
                  >
                    {last ? "This wk" : `${weekly.length - 1 - i}w`}
                  </span>
                </button>
              );
            })}
          </div>

          {openWeek !== null && (
            <div className="mt-3 border-t border-black/5 pt-3">
              {weeklyBuckets[openWeek].length === 0 ? (
                <p className="text-xs text-gray-400">No leads that week.</p>
              ) : (
                <div className="flex max-h-14 flex-wrap gap-1.5 overflow-y-auto">
                  {weeklyBuckets[openWeek].map((l) => (
                    <button
                      key={l.id}
                      onClick={() => setOpenLeadId(l.id)}
                      className="rounded-full bg-white/70 px-2.5 py-1 text-xs font-medium text-gray-700 transition hover:bg-white"
                    >
                      {l.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Lead pop-out — same rich modal as the leads page, right here */}
      {openLead && (
        <LeadModal
          lead={openLead}
          brand={brand}
          pushing={pushingId === openLead.id}
          onClose={() => setOpenLeadId(null)}
          onStage={(s) => overviewStage(openLead.id, s)}
          onPush={() => overviewPush(openLead)}
          onAddNote={(text) => overviewAddNote(openLead.id, text)}
          onBook={(at) => overviewBook(openLead.id, at)}
          onCancelBooking={() => overviewCancel(openLead.id)}
          onRexReset={() => overviewRexReset(openLead)}
        />
      )}
    </div>
  );
}
