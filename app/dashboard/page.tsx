"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { LeadModal } from "@/app/dashboard/leads/lead-modal";
import SourceIcon from "@/components/SourceIcon";
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

// The shared tile surface. Deliberately quiet: a small roundover, a hairline
// edge and no fill on desktop, so the panels read as areas divided by lines
// rather than as floating boxes on the page. Mobile keeps a soft white fill —
// on a small screen the tiles are the only structure there is.
function glaze() {
  return {
    className:
      "relative overflow-hidden rounded-xl border border-gray-200/70 bg-white/70 lg:border-gray-900/[0.08] lg:bg-transparent",
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
  // A slide-up list of leads (Uncontacted / Follow-ups) opened from the tiles.
  const [leadList, setLeadList] = useState<
    null | { title: string; leads: Lead[] }
  >(null);
  const [pushingId, setPushingId] = useState<string | null>(null);
  // Overview "second page" — a pull-up sheet holding the deeper stats. Opening
  // it flips the bottom nav to light glass so the sheet reads through it.
  const [moreOpen, setMoreOpen] = useState(false);
  const dragStartY = useRef<number | null>(null);
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("teg:nav-light", { detail: moreOpen }));
    return () => {
      window.dispatchEvent(new CustomEvent("teg:nav-light", { detail: false }));
    };
  }, [moreOpen]);
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

  // Pull-to-refresh (fired from the shell) re-checks for new leads.
  useEffect(() => {
    const h = () => fetchLeads().then(setLeads);
    window.addEventListener("teg:refresh", h);
    return () => window.removeEventListener("teg:refresh", h);
  }, []);

  // While the lead-list sheet is open, lock the background so it can't scroll
  // (also keeps pull-to-refresh from firing underneath it).
  useEffect(() => {
    if (!leadList) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [leadList]);

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

  // Leads per day across the last 7 days (today on the right) — drives the
  // little bar graph. Deliberately the SAME rolling-7-day window as
  // `weekly[last]` ("This week"), so the graph's total always equals the This-
  // week count (a lead 5 days ago belongs to both, even if that was before
  // Monday).
  const daily = useMemo(() => {
    const DAY = 24 * 3600 * 1000;
    const INIT = ["S", "M", "T", "W", "T", "F", "S"]; // getDay() 0=Sun
    const now = Date.now();
    const days = Array.from({ length: 7 }, (_, i) => {
      const daysAgo = 6 - i; // index 6 (rightmost) = today
      const d = new Date(now - daysAgo * DAY);
      return { label: INIT[d.getDay()], count: 0, isToday: daysAgo === 0 };
    });
    for (const l of leads) {
      const daysAgo = Math.floor(
        (now - new Date(l.receivedAt).getTime()) / DAY,
      );
      if (daysAgo >= 0 && daysAgo < 7) days[6 - daysAgo].count++;
    }
    return days;
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

  // Derived figures for the pull-up "second page" — the stuff worth geeking
  // out over, kept off page one entirely.
  const fmtGap = (ms: number) => {
    const mins = Math.round(ms / 60000);
    if (mins < 60) return `${mins}m`;
    const h = Math.floor(mins / 60);
    if (h < 24) return mins % 60 ? `${h}h ${mins % 60}m` : `${h}h`;
    return `${Math.floor(h / 24)}d ${h % 24}h`;
  };
  const speedSamples = leads
    .map((l) => {
      const first = l.history?.find((h) => h.stage !== "new");
      return first
        ? new Date(first.at).getTime() - new Date(l.receivedAt).getTime()
        : null;
    })
    .filter((v): v is number => v !== null && v >= 0);
  const deepStats: { label: string; value: string; hint?: string }[] = [
    {
      label: "Impressions",
      value: myMeta ? myMeta.impressions.toLocaleString("en-GB") : "—",
      hint: "times your ads were seen",
    },
    {
      label: "Clicks",
      value: myMeta ? myMeta.clicks.toLocaleString("en-GB") : "—",
      hint: "taps through to your form",
    },
    {
      label: "Click rate",
      value:
        myMeta && myMeta.impressions > 0
          ? `${((myMeta.clicks / myMeta.impressions) * 100).toFixed(1)}%`
          : "—",
      hint: "clicks per impression",
    },
    {
      label: "Cost per lead",
      value: leads.length > 0 && spent > 0 ? `£${Math.round(spent / leads.length)}` : "—",
      hint: "spend ÷ leads",
    },
    { label: "Leads", value: String(leads.length), hint: "all time" },
    { label: "Converted", value: String(converted), hint: brand.conversionLabel },
    {
      label: "Conversion rate",
      value: leads.length > 0 ? `${Math.round((converted / leads.length) * 100)}%` : "—",
      hint: "leads that convert",
    },
    {
      label: "Speed to lead",
      value: speedSamples.length
        ? fmtGap(speedSamples.reduce((a, b) => a + b, 0) / speedSamples.length)
        : "—",
      hint: "avg time to first contact",
    },
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
        <div className="pt-1 lg:pt-0">
          <p className="text-sm text-gray-400 lg:text-sm">
            {new Date().toLocaleDateString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </p>
          <h1 className="mt-1.5 text-[38px] font-light leading-[1.04] tracking-[-0.03em] lg:mt-1 lg:text-[44px]">
            Morning, {user.name.split(" ")[0]}
            {/* Wave — desktop only. Wrapped so the visibility toggle isn't
                overridden by .wave-hand's own `display`. */}
            <span className="ml-2 hidden lg:inline">
              <span className="wave-hand" role="img" aria-label="waving hand">
                👋
              </span>
            </span>
          </h1>
        </div>

      </div>

      {/* Desktop stat row — its own full-width band under the greeting, split
          by hairlines rather than sat in boxes. Big, light numerals; the label
          carries the meaning, so no icons competing with it. On mobile these
          become the four square tiles in the mobile-only section below. */}
      <div className="mt-6 hidden border-y border-gray-900/[0.08] lg:block">
        <div className="grid grid-cols-4 divide-x divide-gray-900/[0.08]">
          {stats.map((s) => (
            <div key={s.label} className="px-7 py-5 first:pl-0">
              <p className="text-[40px] font-light leading-none tracking-[-0.04em] tabular-nums">
                {s.value}
              </p>
              <p className="mt-2.5 text-[13px] text-gray-500">{s.label}</p>
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
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3.5 py-2.5">
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
          {/* One line, on a rule rather than in a card. This is the only thing
              between the overview and fitting on a single screen, and it's
              temporary — it goes for good once the mailbox is connected. */}
          <section className="mt-5 hidden items-center justify-between gap-6 border-b border-gray-900/[0.08] pb-5 lg:flex">
            <div className="flex min-w-0 items-center gap-3">
              <span className="text-base">✉️</span>
              <p className="truncate text-[15px] text-gray-600">
                <span className="font-medium text-gray-900">
                  Connect your email
                </span>{" "}
                — lead emails then send from your own address, and we&apos;ll
                link up your CRM automatically.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                onClick={() => {
                  setEmailPendingConnect(true);
                  setEmailPromptOpen(false);
                }}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
                style={{ backgroundColor: brand.accent }}
              >
                Connect with Microsoft
              </button>
              <button
                onClick={() => setEmailPromptOpen(false)}
                className="rounded-lg px-3 py-2 text-sm font-medium text-gray-400 hover:text-gray-600"
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
          className="mt-6 rounded-xl border-2 bg-white/70 p-6 backdrop-blur-xl"
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
      <section className="mt-6 space-y-4 lg:hidden">
        {/* Row 1 — Uncontacted · Follow-ups. Tapping either slides up the full
            list of those leads. */}
        <div className="grid grid-cols-2 gap-4">
          {/* Uncontacted — the action tile (accent tint) */}
          <button
            type="button"
            onClick={() =>
              setLeadList({ title: "Uncontacted", leads: untouched })
            }
            className="relative flex aspect-square flex-col items-start overflow-hidden rounded-xl border border-white/60 bg-white/70 p-5 text-left transition active:scale-[0.98]"
          >
            {leadsLoaded && untouched.length > 0 && (
              <span
                className="absolute right-4 top-4 rounded-full px-2.5 py-1 text-[10px] font-semibold text-white"
                style={{ backgroundColor: brand.accent }}
              >
                action now
              </span>
            )}
            <div className="mt-auto">
              <span className="block text-[54px] font-semibold leading-none tracking-tight text-gray-900">
                {leadsLoaded ? <AnimatedNumber value={untouched.length} /> : "—"}
              </span>
              <span className="mt-2 flex items-center gap-1 text-sm font-medium text-gray-700">
                Uncontacted
                {untouched.length > 0 && <TileChevron />}
              </span>
            </div>
          </button>

          {/* Follow-ups */}
          <button
            type="button"
            onClick={() =>
              setLeadList({ title: "Follow-ups", leads: followUps })
            }
            className="relative flex aspect-square flex-col items-start overflow-hidden rounded-xl border border-white/60 bg-white/70 p-5 text-left transition active:scale-[0.98]"
          >
            {leadsLoaded && followUps.length > 0 && (
              <span className="absolute right-4 top-4 rounded-full bg-black/5 px-2.5 py-1 text-[10px] font-semibold text-gray-500">
                due back
              </span>
            )}
            <div className="mt-auto">
              <span className="block text-[54px] font-semibold leading-none tracking-tight text-gray-900">
                {leadsLoaded ? <AnimatedNumber value={followUps.length} /> : "—"}
              </span>
              <span className="mt-2 flex items-center gap-1 text-sm font-medium text-gray-700">
                Follow-ups
                {followUps.length > 0 && <TileChevron />}
              </span>
            </div>
          </button>
        </div>

        {/* Leads this week — a little bar graph (today in brand colour). Sits
            above the This-week / Ad-spend row. */}
        {(() => {
          const dayMax = Math.max(1, ...daily.map((d) => d.count));
          const total = daily.reduce((a, d) => a + d.count, 0);
          return (
            <div className="rounded-xl border border-white/60 bg-white/70 p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">
                  Leads this week
                </h2>
                <span className="rounded-full bg-black/5 px-2.5 py-1 text-[11px] font-medium text-gray-500">
                  {total} total
                </span>
              </div>
              <div className="mt-5 flex gap-3">
                <div className="flex h-24 flex-col justify-between py-0.5 text-[10px] font-medium text-gray-300">
                  <span>{dayMax}</span>
                  <span>{Math.round(dayMax / 2)}</span>
                  <span>0</span>
                </div>
                <div className="flex h-24 flex-1 items-end justify-between gap-2.5">
                  {daily.map((d, i) => (
                    <div
                      key={i}
                      className="flex h-full flex-1 flex-col items-center justify-end gap-2"
                    >
                      <div className="flex w-full flex-1 items-end">
                        <div
                          className="w-full origin-bottom rounded-md animate-[bar-grow_0.6s_cubic-bezier(0.22,1,0.36,1)_both]"
                          style={{
                            height: `${Math.max((d.count / dayMax) * 100, d.count > 0 ? 8 : 3)}%`,
                            animationDelay: `${i * 70}ms`,
                            background: d.isToday
                              ? brand.accent
                              : i % 2 === 1
                                ? "repeating-linear-gradient(45deg, #111827 0 2px, transparent 2px 5px)"
                                : "#111827",
                            opacity: d.count === 0 && !d.isToday ? 0.14 : 1,
                          }}
                        />
                      </div>
                      <span
                        className={`text-[10px] font-medium ${d.isToday ? "" : "text-gray-400"}`}
                        style={d.isToday ? { color: brand.accent } : undefined}
                      >
                        {d.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Footer note — full-bleed with big soft corners, running on down
            BEHIND the floating nav so the page never looks like it stops short.
            A white pull-tab pokes up out of the top edge and bobs to invite the
            tap; swipe it up or tap it for the second page. */}
        <div className="-mx-4 -mb-24">
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            onTouchStart={(e) => { dragStartY.current = e.touches[0].clientY; }}
            onTouchEnd={(e) => {
              const dy = dragStartY.current == null ? 0 : dragStartY.current - e.changedTouches[0].clientY;
              dragStartY.current = null;
              if (dy > 20) setMoreOpen(true);
            }}
            className="relative block w-full pt-7 text-left"
          >
            {/* The pull-tab — sits half out of the panel and bobs. */}
            <span className="tab-bob absolute left-1/2 top-0 z-10 flex h-[50px] w-[50px] -translate-x-1/2 items-center justify-center rounded-full bg-white text-gray-950 shadow-[0_10px_22px_-8px_rgba(0,0,0,0.55)]">
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 15l-6-6-6 6" />
              </svg>
            </span>

            <span className="relative block overflow-hidden rounded-t-[44px] bg-gray-950 px-6 pb-40 pt-7 text-white">
              {/* Brand-coloured glow, bled off the corner. */}
              <span
                className="pointer-events-none absolute -right-12 -top-20 h-56 w-56 rounded-full opacity-40 blur-3xl"
                style={{ backgroundColor: brand.accent }}
              />

              <span className="relative flex items-end justify-between gap-5">
                <span className="block">
                  <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">
                    Want to geek out?
                  </span>
                  <span className="mt-1.5 block text-[27px] font-semibold leading-[1.03] tracking-tight">
                    The numbers
                    <br />
                    behind it all
                  </span>
                </span>

                {/* Little live equaliser — hints at the data waiting behind. */}
                <span className="mb-1.5 flex h-11 shrink-0 items-end gap-1.5">
                  {[62, 100, 44, 86, 54, 96].map((h, i) => (
                    <span
                      key={i}
                      className="eq-bar block w-[6px] rounded-full bg-white/30"
                      style={{ height: `${h}%`, animationDelay: `${i * 0.13}s` }}
                    />
                  ))}
                </span>
              </span>

              {/* A taste of the actual numbers. */}
              <span className="relative mt-4 flex flex-wrap gap-2">
                {[
                  `£${spent} spend`,
                  `${leads.length} lead${leads.length === 1 ? "" : "s"}`,
                  `${deepStats.find((s) => s.label === "Speed to lead")?.value ?? "—"} to lead`,
                ].map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white/80"
                  >
                    {t}
                  </span>
                ))}
              </span>
            </span>
          </button>
        </div>
      </section>

      {/* ══ PAGE 2 — the deeper stats, on a pull-up "second page" ══ */}
      {moreOpen && (
        <button
          aria-hidden
          onClick={() => setMoreOpen(false)}
          className="fixed inset-0 z-[44] cursor-default bg-gray-900/20 lg:hidden"
        />
      )}
      <div
        className="fixed inset-x-2 bottom-0 z-[45] flex h-[90vh] flex-col overflow-hidden rounded-t-[30px] border border-white/60 bg-[#f4f4f5] shadow-[0_-24px_60px_-24px_rgba(0,0,0,0.45)] lg:hidden"
        style={{
          transform: moreOpen ? "translateY(0)" : "translateY(100%)",
          transition: "transform 0.6s cubic-bezier(0.22,1.5,0.36,1)",
        }}
      >
        {/* Grab handle — swipe down (or tap) to drop back to page one. */}
        <button
          type="button"
          onClick={() => setMoreOpen(false)}
          onTouchStart={(e) => { dragStartY.current = e.touches[0].clientY; }}
          onTouchEnd={(e) => {
            const dy = dragStartY.current == null ? 0 : e.changedTouches[0].clientY - dragStartY.current;
            dragStartY.current = null;
            if (dy > 20) setMoreOpen(false);
          }}
          className="flex w-full shrink-0 flex-col items-center gap-2 pb-2 pt-3.5"
        >
          <span className="h-1.5 w-10 rounded-full bg-gray-300" />
          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Your numbers</span>
        </button>

        <div className="flex-1 space-y-5 overflow-y-auto px-2 pb-[calc(env(safe-area-inset-bottom)+120px)] pt-1">
        {/* Row 2 — This week · Ad spend (pie) */}
        <div className="grid grid-cols-2 gap-4">
          {/* This week — leads + trend vs last week */}
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
              <div className="flex aspect-square flex-col rounded-xl border border-white/60 bg-white/70 p-5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  This week
                </p>
                <p className="mt-1 text-[40px] font-semibold leading-none tracking-tight text-gray-900">
                  <AnimatedNumber value={thisWk} />
                </p>
                <p className="mt-1 text-[11px] text-gray-400">
                  lead{thisWk === 1 ? "" : "s"}
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

          {/* Ad spend — a pie: spent in the brand colour, remaining hatched grey */}
          <div className="flex aspect-square flex-col rounded-xl border border-white/60 bg-white/70 p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              Ad spend
            </p>
            <div className="mt-auto flex items-end justify-between gap-1">
              <SpendPie spent={spent} cap={cap} accent={brand.accent} />
              <div className="text-right">
                <p
                  className="text-[26px] font-semibold leading-none tracking-tight"
                  style={{ color: brand.accent }}
                >
                  <AnimatedNumber value={spent} prefix="£" />
                </p>
                <p className="mt-1.5 text-[11px] font-medium text-gray-600">
                  £{spendLeft} left
                </p>
                <p className="text-[11px] text-gray-400">of £{cap}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Everything else worth knowing — the geek-out grid. */}
        <div className="grid grid-cols-2 gap-4">
          {deepStats.map((s) => (
            <div
              key={s.label}
              className="flex flex-col justify-center rounded-xl border border-white/60 bg-white/70 px-4 py-4"
            >
              <p className="text-[26px] font-semibold leading-none tracking-tight text-gray-900">
                {s.value}
              </p>
              <p className="mt-1.5 text-[12.5px] font-medium text-gray-700">{s.label}</p>
              {s.hint && (
                <p className="mt-0.5 text-[11px] leading-snug text-gray-400">{s.hint}</p>
              )}
            </div>
          ))}
        </div>
        </div>
      </div>

      {/* Bento — square glaze tiles, Onboarding Tracker spans both rows.
          Desktop only; mobile uses the tailored section above. */}
      <section
        className={`mt-5 hidden grid-cols-1 gap-3 overflow-x-clip sm:grid-cols-2 lg:mt-6 lg:grid lg:gap-4 ${
          trackerGone ? "lg:grid-cols-3" : "lg:grid-cols-4"
        }`}
      >
        {/* Current ad — the REAL live creatives straight from Meta when the
            campaign's tagged, rotating through every ad (10s each); the
            personalised mock until then. */}
        {myCreatives.length > 0 ? (
          <div className="relative hidden overflow-hidden rounded-xl border border-white/10 text-white lg:block lg:h-[208px]">
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
            className="relative hidden overflow-hidden rounded-xl border border-white/10 p-5 text-white shadow-[inset_0_0_60px_rgba(0,0,0,0.35)] lg:block lg:h-[208px]"
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
        <div className={`${g.className} p-5 lg:h-[208px]`} style={g.style}>
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
        <div className={`${g.className} p-5 lg:h-[208px]`} style={g.style}>
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
        <div className={`${g.className} p-5 lg:h-[208px]`} style={g.style}>
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

      {/* Lead list — slides up from the bottom when a tile is tapped
          (Uncontacted / Follow-ups). Mobile only; tapping a row opens the full
          lead file. */}
      {leadList && (
        <div
          className="fixed inset-0 z-[95] flex items-end bg-gray-900/40 lg:hidden"
          onClick={() => setLeadList(null)}
        >
          <div
            className="relative w-full animate-[sheet-up_0.46s_cubic-bezier(0.34,1.56,0.64,1)] overflow-hidden rounded-t-3xl bg-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 pb-3 pt-5">
              <h3 className="text-lg font-semibold text-gray-900">
                {leadList.title}
              </h3>
              <div className="flex items-center gap-3">
                <span className="rounded-full bg-black/5 px-2.5 py-1 text-xs font-medium text-gray-500">
                  {leadList.leads.length}
                </span>
                <button
                  onClick={() => setLeadList(null)}
                  aria-label="Close"
                  className="rounded-full p-1 text-gray-400 active:bg-gray-100"
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="max-h-[64vh] overflow-y-auto px-3 pb-[calc(env(safe-area-inset-bottom)+52px)] pt-1">
              {leadList.leads.length === 0 ? (
                <p className="py-12 text-center text-sm text-gray-400">
                  Nothing here right now 🎉
                </p>
              ) : (
                leadList.leads.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => {
                      setOpenLeadId(l.id);
                      setLeadList(null);
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition active:bg-black/5"
                  >
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                      style={{ backgroundColor: brand.accentSoft }}
                    >
                      <SourceIcon source={l.source} size={20} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium text-gray-900">
                        {l.name}
                      </span>
                      <span className="block truncate text-[13px] text-gray-400">
                        {l.interestedIn?.trim() ||
                          l.note?.trim() ||
                          `via ${l.source}`}
                      </span>
                    </span>
                    <TileChevron />
                  </button>
                ))
              )}
            </div>

            {/* White bar across the bottom — masks where the nav sits and lets
                the names slide up from underneath it. */}
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-white via-white to-transparent"
              style={{ height: "calc(env(safe-area-inset-bottom) + 56px)" }}
            />
          </div>
        </div>
      )}

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

// Eases a value from 0 up to `target` on mount and whenever the target
// changes — the "count up on sign-in" feel for the overview numbers/graphs.
function useCountUp(target: number, duration = 950): number {
  const [val, setVal] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    let startTs = 0;
    const from = 0;
    const step = (ts: number) => {
      if (!startTs) startTs = ts;
      const p = Math.min((ts - startTs) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setVal(from + (target - from) * eased);
      if (p < 1) raf.current = requestAnimationFrame(step);
      else setVal(target);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration]);
  return val;
}

// A number that counts up to its value.
function AnimatedNumber({
  value,
  prefix = "",
}: {
  value: number;
  prefix?: string;
}) {
  const v = useCountUp(value);
  return (
    <>
      {prefix}
      {Math.round(v)}
    </>
  );
}

// Ad-spend pie: the whole circle is the monthly cap — spent is a solid brand
// wedge, the remainder is hatched grey (how much is left). The wedge fills up
// from empty on load.
function SpendPie({
  spent,
  cap,
  accent,
}: {
  spent: number;
  cap: number;
  accent: string;
}) {
  const targetF = cap > 0 ? Math.max(0, Math.min(1, spent / cap)) : 0;
  const f = useCountUp(targetF, 1000);
  const R = 38;
  const C = 40;
  const wedge = (from: number, to: number) => {
    const a0 = (from * 360 - 90) * (Math.PI / 180);
    const a1 = (to * 360 - 90) * (Math.PI / 180);
    const x0 = C + R * Math.cos(a0);
    const y0 = C + R * Math.sin(a0);
    const x1 = C + R * Math.cos(a1);
    const y1 = C + R * Math.sin(a1);
    const large = to - from > 0.5 ? 1 : 0;
    return `M${C} ${C} L${x0.toFixed(2)} ${y0.toFixed(2)} A${R} ${R} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;
  };
  return (
    <svg width={74} height={74} viewBox="0 0 80 80" className="shrink-0">
      <defs>
        <pattern
          id="spend-hatch"
          width="5"
          height="5"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width="5" height="5" fill="#eceef1" />
          <line x1="0" y1="0" x2="0" y2="5" stroke="#c3c7cf" strokeWidth="1.5" />
        </pattern>
      </defs>
      {/* remaining — hatched grey base circle */}
      <circle cx={C} cy={C} r={R} fill="url(#spend-hatch)" />
      {/* spent — solid brand wedge on top */}
      {f > 0 &&
        (f >= 0.999 ? (
          <circle cx={C} cy={C} r={R} fill={accent} />
        ) : (
          <path d={wedge(0, f)} fill={accent} />
        ))}
    </svg>
  );
}

// Small "go" chevron for the tappable mobile tiles.
function TileChevron() {
  return (
    <svg
      className="h-4 w-4 text-gray-400"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
    </svg>
  );
}
