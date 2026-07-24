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
  sendLeadEmail,
  setLeadFollowUp,
} from "@/lib/session";
import { brandById, type Brand } from "@/lib/brands";
import { getPreviewBrandId, getPreviewAccent } from "@/lib/preview";
import { packageById } from "@/lib/packages";
import { ONBOARDING_STAGES, stageIndex } from "@/lib/onboarding";
import Confetti from "@/components/Confetti";
import Collapse from "@/components/Collapse";
import LeadSwipeStack from "@/components/LeadSwipeStack";
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
// Desktop only: the backdrop-blur glass. On mobile it's a near-solid tile —
// stacking many backdrop-blur layers there overwhelms the compositor (content
// behind them, e.g. the onboarding card, silently fails to paint).
function glaze() {
  return {
    className:
      "relative overflow-hidden rounded-3xl border border-white/40 bg-white/70 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.12),inset_0_1px_1px_rgba(255,255,255,0.7),inset_0_0_30px_rgba(0,0,0,0.08)] lg:bg-[rgba(255,255,255,0.2)] lg:backdrop-blur-xl",
    style: {} as React.CSSProperties,
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
  // Separate hover state for the Uncontacted tile so it never links up with
  // Recent leads (a lead can appear in both — hovering one must not blur the
  // matching row in the other box).
  const [hoverUncontacted, setHoverUncontacted] = useState<string | null>(null);
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
  // The actual live ads' creative images, when Meta can give us them — swaps
  // the "Current ad" mock for the real thing, rotating through every ad.
  const [myCreatives, setMyCreatives] = useState<
    Array<{ adName: string; imageUrl: string }>
  >([]);
  const [creativeIdx, setCreativeIdx] = useState(0);
  // "Connect your email" nudge — part of getting set up, but always
  // skippable ("later" is remembered per user), and always available again
  // from Profile → Email sending.
  const [emailPromptHidden, setEmailPromptHidden] = useState(true);
  // Drives the collapse: `open` false starts the fold-away; `gone` unmounts it
  // once the animation lands; `pendingConnect` means fold first, then head off
  // to the Microsoft sign-in (so the box tidies away before we leave).
  const [emailPromptOpen, setEmailPromptOpen] = useState(true);
  const [emailPromptGone, setEmailPromptGone] = useState(false);
  const [emailPendingConnect, setEmailPendingConnect] = useState(false);
  useEffect(() => {
    if (!user) return;
    try {
      setEmailPromptHidden(
        !!localStorage.getItem(`email-prompt-later-${user.id}`)
      );
    } catch {
      setEmailPromptHidden(false);
    }
  }, [user]);

  // The going-live confetti fires ONCE per user (first visit after the
  // campaign goes live), not on every page load — tracked in localStorage.
  const [celebrateLive, setCelebrateLive] = useState(false);
  useEffect(() => {
    if (!user || user.onboardingStage !== "live") return;
    try {
      const key = `confetti-live-${user.id}`;
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, "1");
        setCelebrateLive(true);
      }
    } catch {
      /* storage blocked — just skip the party */
    }
  }, [user]);

  // Once the campaign is live the tracker has done its job: after the
  // confetti, the tile folds in on itself and slides off to the right, and
  // the grid relaxes to three columns so the other boxes get the room.
  // `trackerLeaving` plays the exit; `trackerGone` unmounts it (persisted, so
  // it stays away on future visits).
  const [trackerLeaving, setTrackerLeaving] = useState(false);
  const [trackerGone, setTrackerGone] = useState(false);
  useEffect(() => {
    if (!user || user.onboardingStage !== "live") return;
    const key = `tracker-away-${user.id}`;
    try {
      if (localStorage.getItem(key)) {
        setTrackerGone(true);
        return;
      }
    } catch {
      /* storage blocked — play the animation every time, better than never */
    }
    // Let the confetti land first, then wave the tile off. A second timer is a
    // safety net: if the exit transition never emits a transitionend (some
    // browsers don't for an unchanged transform), unmount anyway so the tile
    // can't linger invisible and leave a gap.
    const t = setTimeout(() => setTrackerLeaving(true), 3200);
    const t2 = setTimeout(() => trackerExitDone(), 4200);
    return () => {
      clearTimeout(t);
      clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);
  function trackerExitDone() {
    setTrackerGone(true);
    if (user) {
      try {
        localStorage.setItem(`tracker-away-${user.id}`, "1");
      } catch {
        /* ignore */
      }
    }
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
        if (Array.isArray(d?.creatives)) setMyCreatives(d.creatives);
      })
      .catch(() => {});
  }, []);

  // Rotate the Current-ad tile through every live creative, one per 10s.
  useEffect(() => {
    if (myCreatives.length < 2) return;
    const t = setInterval(
      () => setCreativeIdx((i) => (i + 1) % myCreatives.length),
      10000
    );
    return () => clearInterval(t);
  }, [myCreatives.length]);

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
  // A lead with a follow-up date in the future is resting — out of both boxes
  // until the day it's due back.
  const resting = (l: Lead) =>
    !!l.followUpAt && new Date(l.followUpAt).getTime() > Date.now();
  // Everything still being worked: not filed away, not finished with.
  const working = leads.filter(
    (l) =>
      !l.archivedAt &&
      l.stage !== "converted" &&
      l.stage !== "pushed" &&
      l.stage !== "lost" &&
      l.stage !== "nurture"
  );
  // Uncontacted — brand new, nobody's tried them yet.
  const untouched = working.filter((l) => l.stage === "new" && !resting(l));
  // Follow-ups — attempts that have come back round, and anything whose
  // reminder has fallen due. Soonest-due first.
  const followUps = working
    .filter((l) => l.stage !== "new" && !resting(l))
    .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));

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
            Morning, {user.name.split(" ")[0]}{" "}
            <span className="wave-hand" role="img" aria-label="waving hand">
              👋
            </span>
          </h1>
        </div>

        {/* Desktop stat row. On mobile these become the four square tiles in
            the mobile-only section below. */}
        <div className="hidden items-end gap-4 lg:flex lg:gap-9">
          {stats.map((s) => (
            <div key={s.label} className="flex items-center gap-2.5">
              <svg
                className="hidden h-5 w-5 shrink-0 lg:block"
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
                <p className="text-lg font-semibold leading-none tracking-tight lg:text-3xl">
                  {s.value}
                </p>
                <p className="mt-1 text-[11px] text-gray-500 lg:text-xs">{s.label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Connect-your-email nudge — the setup step for sending lead emails
          from the portal. Skippable, and lives on in Profile settings.
          Desktop: the full banner. Mobile: a slim toast (below), out of the
          way. */}
      {!user.msEmail && !emailPromptHidden && !emailPromptGone && (
        <div className="lg:hidden">
          <div className="mt-4 flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-3.5 py-2.5">
            <span className="text-base">✉️</span>
            <p className="min-w-0 flex-1 text-[13px] leading-snug text-gray-600">
              Connect your email to send from your own address.
            </p>
            <button
              onClick={() => {
                window.location.href = "/api/auth/microsoft/start";
              }}
              className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
              style={{ backgroundColor: brand.accent }}
            >
              Connect
            </button>
            <button
              onClick={() => {
                setEmailPromptHidden(true);
                try {
                  localStorage.setItem(`email-prompt-later-${user.id}`, "1");
                } catch {
                  /* it'll just show again next visit */
                }
              }}
              aria-label="Dismiss"
              className="shrink-0 text-gray-300 hover:text-gray-500"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        </div>
      )}
      {!user.msEmail && !emailPromptHidden && !emailPromptGone && (
        <Collapse
          open={emailPromptOpen}
          onCollapsed={() => {
            setEmailPromptGone(true);
            if (emailPendingConnect) {
              window.location.href = "/api/auth/microsoft/start";
            } else {
              try {
                localStorage.setItem(`email-prompt-later-${user.id}`, "1");
              } catch {
                /* it'll just show again next visit */
              }
            }
          }}
        >
          <section className="mt-6 hidden flex-wrap items-center justify-between gap-4 rounded-3xl border border-gray-200 bg-white/70 p-5 backdrop-blur-xl lg:flex">
            <div className="flex items-center gap-4">
              <span
                className="flex h-11 w-11 items-center justify-center rounded-2xl text-lg"
                style={{ backgroundColor: `${brand.accent}1a` }}
              >
                ✉️
              </span>
              <div>
                <p className="font-semibold">Connect your email</p>
                <p className="text-sm text-gray-500">
                  Sign in with your work email once — lead emails then send from
                  your own address, and we'll link up your CRM account
                  automatically.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setEmailPendingConnect(true);
                  setEmailPromptOpen(false);
                }}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                style={{ backgroundColor: brand.accent }}
              >
                Connect with Microsoft
              </button>
              <button
                onClick={() => setEmailPromptOpen(false)}
                className="rounded-xl px-3 py-2.5 text-sm font-medium text-gray-400 hover:text-gray-600"
              >
                Later
              </button>
            </div>
          </section>
        </Collapse>
      )}

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

      {/* ══ MOBILE overview (<lg) — swipeable Uncontacted + compact tiles ══ */}
      <section className="mt-6 lg:hidden">
        {/* Uncontacted — Tinder-style swipe stack */}
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Uncontacted
          </h2>
          {leadsLoaded && untouched.length > 0 && (
            <span className="rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-semibold text-white">
              {untouched.length}
            </span>
          )}
        </div>
        {leadsLoaded && untouched.length === 0 ? (
          <div className="relative flex h-40 flex-col items-center justify-center overflow-hidden rounded-3xl border border-white/60 bg-white/70 text-center">
            <Confetti fire />
            <p className="text-2xl font-bold tracking-tight text-gray-900">
              All caught up
            </p>
            <p className="mt-1 text-xs text-gray-500">No leads to action 🎉</p>
          </div>
        ) : (
          <LeadSwipeStack
            leads={untouched}
            brand={brand}
            onOpen={(l) => setOpenLeadId(l.id)}
            onResurface={async (l) => {
              const t = new Date();
              t.setDate(t.getDate() + 1);
              t.setHours(8, 0, 0, 0);
              await setLeadFollowUp(l.id, t.toISOString());
              setLeads(await fetchLeads());
            }}
          />
        )}

        {/* Follow-ups */}
        {followUps.length > 0 && (
          <div className="mt-4 rounded-3xl border border-white/60 bg-white/70 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Follow-ups</h2>
              <Link
                href="/dashboard/leads"
                className="text-xs font-medium"
                style={{ color: brand.accent }}
              >
                All →
              </Link>
            </div>
            <div className="mt-3 space-y-1">
              {followUps.slice(0, 3).map((lead) => (
                <button
                  key={lead.id}
                  onClick={() => setOpenLeadId(lead.id)}
                  className="flex w-full items-center gap-2 rounded-lg py-1.5 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {lead.name}
                    </span>
                    <span className="block truncate text-[11px] text-gray-400">
                      {lead.stage === "attempt3"
                        ? "3 tries — ready for the funnel"
                        : "Due for a follow-up"}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Leads-per-week + Ad spend — two square tiles side by side */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          {(() => {
            const thisWk = weekly[weekly.length - 1] ?? 0;
            const lastWk = weekly[weekly.length - 2] ?? 0;
            const pct =
              lastWk > 0
                ? Math.round(((thisWk - lastWk) / lastWk) * 100)
                : thisWk > 0
                  ? 100
                  : 0;
            const up = thisWk >= lastWk;
            return (
              <div className="flex aspect-square flex-col rounded-3xl border border-white/60 bg-white/70 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  This week
                </p>
                <p className="mt-1 text-3xl font-semibold tracking-tight text-gray-900">
                  {thisWk}
                  <span className="ml-1 text-sm font-normal text-gray-400">
                    lead{thisWk === 1 ? "" : "s"}
                  </span>
                </p>
                <div
                  className={`mt-auto flex items-center gap-1 text-sm font-semibold ${
                    up ? "text-green-600" : "text-red-500"
                  }`}
                >
                  <svg
                    className={`h-4 w-4 ${up ? "" : "rotate-180"}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.2}
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                  </svg>
                  {Math.abs(pct)}% {up ? "up" : "down"}
                </div>
                <p className="text-[11px] text-gray-400">on last week</p>
              </div>
            );
          })()}

          <div className="flex aspect-square flex-col rounded-3xl border border-white/60 bg-white/70 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              Ad spend
            </p>
            <p
              className="mt-1 text-3xl font-semibold tracking-tight"
              style={{ color: brand.accent }}
            >
              £{spent}
            </p>
            <p className="text-[11px] text-gray-400">of £{cap} this month</p>
            <div className="mt-auto">
              <div className="h-2 overflow-hidden rounded-full bg-black/5">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${spendPct}%`, backgroundColor: brand.accent }}
                />
              </div>
              <p className="mt-1.5 text-[11px] font-medium text-gray-500">
                £{spendLeft} left
              </p>
            </div>
          </div>
        </div>

        {/* Four stat squares — the headline totals */}
        <div className="mt-3 grid grid-cols-2 gap-3">
          {stats.map((s) => (
            <div
              key={s.label}
              className="flex flex-col justify-center rounded-2xl border border-white/60 bg-white/70 px-4 py-3.5"
            >
              <p className="text-2xl font-semibold tracking-tight text-gray-900">
                {s.value}
              </p>
              <p className="mt-0.5 text-xs text-gray-500">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Bento — square glaze tiles, Onboarding Tracker spans both rows.
          Desktop only; mobile uses the tailored section above. */}
      <section
        className={`mt-5 hidden grid-cols-1 gap-3 overflow-x-clip sm:grid-cols-2 lg:mt-8 lg:grid lg:gap-4 ${
          trackerGone ? "lg:grid-cols-3" : "lg:grid-cols-4"
        }`}
      >
        {/* Current ad — the REAL live creatives straight from Meta when the
            campaign's tagged, rotating through every ad (10s each); the
            personalised mock until then. */}
        {myCreatives.length > 0 ? (
          <div className="relative hidden aspect-square overflow-hidden rounded-3xl border border-white/10 text-white shadow-[0_2px_8px_-2px_rgba(0,0,0,0.14)] lg:block">
            {/* keyed on the index so each rotation fades in */}
            <div key={creativeIdx} className="fade-up absolute inset-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={myCreatives[creativeIdx % myCreatives.length].imageUrl}
                alt={myCreatives[creativeIdx % myCreatives.length].adName}
                className="absolute inset-0 h-full w-full object-cover"
              />
            </div>
            {/* Fixed scrim — doesn't rotate with the ad: a soft blur that
                gradates out upwards plus a dark fade, so the ad name stays
                readable over whatever creative is behind it */}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/5 to-black/30" />
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 h-32 backdrop-blur-md"
              style={{
                maskImage:
                  "linear-gradient(to top, black 35%, transparent 100%)",
                WebkitMaskImage:
                  "linear-gradient(to top, black 35%, transparent 100%)",
              }}
            />
            {/* The name fades with each rotation, above the fixed scrim */}
            <div
              key={`label-${creativeIdx}`}
              className="fade-up absolute inset-x-0 bottom-0 p-5 pb-7"
            >
              <p className="truncate font-semibold">
                {myCreatives[creativeIdx % myCreatives.length].adName}
              </p>
              <p className="text-xs text-white/70">
                £{pkg?.adSpend?.toLocaleString("en-GB")}/mo
              </p>
            </div>
            <div className="absolute inset-x-0 top-0 flex items-start justify-between p-5">
              <span className="rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide backdrop-blur">
                Current ad
              </span>
              <span className="flex items-center gap-1 rounded-full bg-green-500/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide backdrop-blur">
                ● Live
              </span>
            </div>
            {/* Rotation dots — one per ad */}
            {myCreatives.length > 1 && (
              <div className="absolute inset-x-0 bottom-2.5 flex justify-center gap-1.5">
                {myCreatives.map((_, i) => (
                  <span
                    key={i}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      i === creativeIdx % myCreatives.length
                        ? "w-4 bg-white"
                        : "w-1.5 bg-white/40"
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div
            className="relative hidden aspect-square overflow-hidden rounded-3xl border border-white/10 p-5 text-white shadow-[0_2px_8px_-2px_rgba(0,0,0,0.14),inset_0_0_60px_rgba(0,0,0,0.35)] lg:block"
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
        <div className={`${g.className} p-5 lg:aspect-square`} style={g.style}>
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
                {untouched.slice(0, 4).map((l) => {
                  const dim =
                    hoverUncontacted !== null && hoverUncontacted !== l.id;
                  const active = hoverUncontacted === l.id;
                  return (
                    <button
                      key={l.id}
                      onClick={() => setOpenLeadId(l.id)}
                      onMouseEnter={() => setHoverUncontacted(l.id)}
                      onMouseLeave={() => setHoverUncontacted(null)}
                      className={`flex w-full items-center gap-2.5 rounded-xl bg-white/40 px-2.5 py-2 text-left transition duration-200 hover:bg-white/60 ${
                        dim ? "opacity-40 blur-[1.5px]" : "opacity-100 blur-0"
                      } ${active ? "scale-[1.03]" : ""}`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-gray-900">
                          {l.name}
                        </p>
                        <p className="truncate text-[11px] capitalize text-gray-500">
                          via {l.source}
                        </p>
                      </div>
                    </button>
                  );
                })}
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

        {/* Follow-ups — leads due back today: an attempt that's come round
            again, or a reminder that's fallen due. */}
        <div className={`${g.className} p-5 lg:aspect-square`} style={g.style}>
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Follow-ups</h2>
              <Link
                href="/dashboard/leads"
                className="text-xs font-medium hover:underline"
                style={{ color: brand.accent }}
              >
                All →
              </Link>
            </div>
            <div className="mt-3 flex-1 space-y-1">
              {followUps.slice(0, 4).map((lead) => {
                const dim = hoverLead !== null && hoverLead !== lead.id;
                const active = hoverLead === lead.id;
                const attempt =
                  lead.stage === "attempt1"
                    ? 1
                    : lead.stage === "attempt2"
                      ? 2
                      : lead.stage === "attempt3"
                        ? 3
                        : null;
                return (
                  <button
                    key={lead.id}
                    onClick={() => setOpenLeadId(lead.id)}
                    onMouseEnter={() => setHoverLead(lead.id)}
                    onMouseLeave={() => setHoverLead(null)}
                    className={`-mx-2 flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left transition duration-200 ${
                      dim ? "opacity-40 blur-[1.5px]" : "opacity-100 blur-0"
                    } ${active ? "scale-[1.04] bg-white/50" : ""}`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{lead.name}</p>
                      <p className="truncate text-[11px] text-gray-400">
                        {attempt === 3
                          ? "3 tries — ready for the funnel"
                          : attempt
                            ? `${attempt} ${attempt === 1 ? "try" : "tries"} so far — try again`
                            : "Due for a follow-up"}
                      </p>
                    </div>
                    {attempt && (
                      <span
                        className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white"
                        style={{ backgroundColor: brand.accent }}
                      >
                        {attempt}/3
                      </span>
                    )}
                  </button>
                );
              })}
              {followUps.length > 4 && (
                <Link
                  href="/dashboard/leads"
                  className="block pt-0.5 text-center text-xs font-medium text-gray-400 hover:text-gray-700"
                >
                  +{followUps.length - 4} more →
                </Link>
              )}
              {leadsLoaded && followUps.length === 0 && (
                <p className="text-xs text-gray-400">
                  Nothing to chase today — anything you&apos;ve tried comes back
                  here tomorrow.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Onboarding Tracker — glazed outer with a dark inner card holding the
            sign-up steps (a rectangle within a rectangle), spans both rows.
            Once live it collapses in and slides off to the right for good. */}
        {!trackerGone && (
        <div
          className={`${g.className} flex flex-col lg:col-start-4 lg:row-span-2 lg:row-start-1 transition-all duration-700 ease-in ${
            trackerLeaving
              ? "translate-x-[130%] scale-90 opacity-0"
              : "translate-x-0 scale-100 opacity-100"
          }`}
          style={g.style}
          onTransitionEnd={(e) => {
            // Fire on opacity — it always transitions 1→0, whereas the
            // transform can compute to `none` and never emit a transitionend,
            // which used to strand the tile invisible-but-space-occupying.
            if (trackerLeaving && e.propertyName === "opacity") trackerExitDone();
          }}
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
            <Confetti fire={celebrateLive} />
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
        )}

        {/* Ad spend running total — the glance-and-go view of budget left */}
        <div className={`${g.className} p-5 lg:aspect-square`} style={g.style}>
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

        {/* Leads per week — wide; click a bar to list that week's leads below.
            Given real height on mobile so the chart has room to breathe. */}
        <div
          className={`${g.className} flex min-h-[260px] flex-col p-5 sm:col-span-2 lg:min-h-0`}
          style={g.style}
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold lg:text-base">Leads per week</h2>
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
            <p className="text-3xl font-semibold tracking-tight lg:text-2xl">
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
                        className={`absolute -top-6 left-1/2 -translate-x-1/2 text-sm font-semibold lg:-top-5 lg:text-[11px] ${
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
          onFollowUp={async (at) => {
            const res = await setLeadFollowUp(openLead.id, at);
            if (res.ok) {
              const fresh = await fetchLeads();
              setLeads(fresh);
              if (at) setOpenLeadId(null); // resting now — close the file
            }
          }}
          emailConnected={!!user.msEmail}
          onSendEmail={async (subject, body) => {
            const res = await sendLeadEmail(openLead.id, subject, body);
            if (res.ok && res.lead) {
              setLeads((prev) =>
                prev.map((l) => (l.id === res.lead!.id ? res.lead! : l))
              );
            }
            return { ok: res.ok, error: res.error };
          }}
        />
      )}
    </div>
  );
}
