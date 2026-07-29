"use client";

import { useEffect, useRef, useState } from "react";
import ICONS, { SocialIcon } from "./SocialIcons";

// "How it works", shown through the app itself: two tabs — Paid Ads and
// Referrals — each with its own steps and a phone mock of the screen you'd
// actually be looking at.

type TabId = "ads" | "referrals";

const STEPS: Record<TabId, { n: string; title: string; body: string }[]> = {
  ads: [
    {
      n: "1",
      title: "Pick a package",
      body: "Choose the level that fits, pay online, and you land straight in your business's portal.",
    },
    {
      n: "2",
      title: "We build and launch",
      body: "We write the ads, design the creatives and set the targeting for your patch. You approve; we go live.",
    },
    {
      n: "3",
      title: "Leads land in your pocket",
      body: "Every enquiry arrives in the app with the phone number already there — no chasing a spreadsheet.",
    },
    {
      n: "4",
      title: "Work them to booked",
      body: "Log each attempt, book the appointment, push it to your CRM. The app nudges you when one goes cold.",
    },
  ],
  referrals: [
    {
      n: "1",
      title: "Spot one you can't help",
      body: "A landlord when you sell. A buyer needing a mortgage. Someone worth money to another business in the group.",
    },
    {
      n: "2",
      title: "Pick who gets it",
      body: "Flick through the businesses, see exactly what you'd earn, and send them on in about twenty seconds.",
    },
    {
      n: "3",
      title: "We find the closest agent",
      body: "Matched on real distance to their patch, so it lands with someone who can actually act on it.",
    },
    {
      n: "4",
      title: "Get paid when it converts",
      body: "Watch it move through their pipeline in your app, right up until your fee is paid.",
    },
  ],
};


/* The phone runs a looping demo rather than sitting still: leads drop in one
   at a time, one opens, its contact button presses, and it starts over. Both
   screens are driven by the same tiny ticker so the timing stays in step.

   Only runs while the phone is actually on screen — and not at all under
   prefers-reduced-motion, where every stage is shown in its finished state. */
function useInView<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const o = new IntersectionObserver(
      (es) => setInView(es.some((e) => e.isIntersecting)),
      { threshold: 0.35 }
    );
    o.observe(el);
    return () => o.disconnect();
  }, []);
  return [ref, inView] as const;
}

const STILL = -1; // reduced motion: skip the choreography, show the end state

function useTicker(running: boolean, steps: number, ms = 700) {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!running) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
      setT(STILL);
      return;
    }
    setT(0);
    const id = window.setInterval(() => setT((v) => (v + 1) % steps), ms);
    return () => window.clearInterval(id);
  }, [running, steps, ms]);
  return t;
}

export default function HowItWorksPhone() {
  const [tab, setTab] = useState<TabId>("ads");
  const [phoneRef, inView] = useInView<HTMLDivElement>();

  return (
    // items-end so the phone hangs off the bottom of the slab rather than
    // sitting in the middle of it; the slab clips it.
    <div className="grid items-start gap-16 lg:grid-cols-2 lg:items-center">
      {/* hiw-copy / hiw-phone are hooks for the desktop scroll scene
          (ProofHowScene drives their opacity/position); outside the scene
          they do nothing. */}
      <div className="hiw-copy lg:pt-12">
        <h2 className="text-4xl font-semibold tracking-tight text-gray-900 sm:text-5xl">
          How it works
        </h2>
        <p className="mt-3 max-w-md text-gray-500">
          Two ways to make money in one app. Pick a side.
        </p>

        {/* Tabs */}
        <div className="mt-8 inline-flex rounded-full bg-[#ffffff] p-1 shadow-lg">
          {([
            ["ads", "Paid Ads"],
            ["referrals", "Referrals"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`rounded-full px-6 py-2.5 text-sm font-medium transition ${
                tab === id
                  ? "bg-[#08080a] text-white"
                  : "text-[#6b7280] hover:text-[#111827]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <ol className="mt-10 min-h-[470px] space-y-7">
          {STEPS[tab].map((s) => (
            <li key={s.n} className="flex gap-5">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gray-300 text-sm font-semibold text-gray-500">
                {s.n}
              </span>
              <div>
                <p className="text-lg font-semibold text-gray-900">{s.title}</p>
                <p className="mt-1.5 max-w-md leading-relaxed text-gray-500">
                  {s.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {/* Phone — the frame never moves; the screen slides between the two.
          Sits centred against the steps rather than hanging off the panel
          edge: cropping it fought the copy, since the cut had to climb high
          enough to matter and that ate the last step. */}
      <div className="hiw-phone relative z-10 flex justify-center lg:justify-end">
        {/* A soft bloom so the phone's edges separate from the slab. */}
        <span
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 h-[560px] w-[460px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-40 blur-[90px] lg:left-auto lg:right-[40px] lg:translate-x-0"
          style={{ background: "radial-gradient(circle, color-mix(in srgb, var(--group) 26%, transparent), color-mix(in srgb, var(--group) 8%, transparent) 55%, transparent 72%)" }}
        />
        <PhoneFrame tab={tab} inView={inView} innerRef={phoneRef} />
      </div>
    </div>
  );
}

function PhoneFrame({
  tab,
  inView,
  innerRef,
}: {
  tab: TabId;
  inView: boolean;
  innerRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div ref={innerRef} className="relative w-[300px] shrink-0 rounded-[44px] border-[7px] border-[#1c1c20] bg-[#f4f4f5] shadow-[0_40px_90px_-30px_rgba(0,0,0,0.45),0_0_0_1px_rgba(0,0,0,0.06)] lg:w-[330px]">
      {/* Dynamic-island style pill */}
      <div className="absolute left-1/2 top-2.5 z-20 h-[22px] w-[86px] -translate-x-1/2 rounded-full bg-[#1c1c20]" />
      <div className="relative h-[600px] overflow-hidden rounded-[37px]">
        {/* Both screens sit side by side and slide, so the handset itself
            stays put — only its display changes. */}
        <div
          className="flex h-full w-[200%] transition-transform duration-[600ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
          style={{ transform: tab === "ads" ? "translateX(0)" : "translateX(-50%)" }}
        >
          <div className="h-full w-1/2">
            <AdsScreen running={inView && tab === "ads"} />
          </div>
          <div className="h-full w-1/2">
            <ReferralScreen running={inView && tab === "referrals"} />
          </div>
        </div>
      </div>
    </div>
  );
}

const LEADS = [
  { n: "Sarah Whitfield", m: "Landed 09:12", tag: "New", src: "LinkedIn", tel: "07700 900 118", area: "Didsbury, M20" },
  { n: "Tom Baker", m: "Attempt 2 · 18 Jul", src: "Meta / Facebook", tel: "07700 900 461", area: "Chorlton, M21" },
  { n: "Priya Shah", m: "Attempt 1 · 17 Jul", src: "Instagram", tel: "07700 900 275", area: "Sale, M33" },
];

function Mark({ src, size = 26 }: { src: string; size?: number }) {
  const icon = ICONS.find((i) => i.name === src)!;
  return (
    <span
      className="flex shrink-0 items-center justify-center"
      style={{ color: icon.color, width: size + 14, height: size + 14 }}
    >
      <SocialIcon icon={icon} className="h-full w-full" />
    </span>
  );
}

/* Leads screen. The loop: nothing → three leads drop in one at a time → the
   top one opens → its call button presses → back to an empty list. */
function AdsScreen({ running }: { running: boolean }) {
  const t = useTicker(running, 12);
  const still = t === STILL;
  const shown = still ? 3 : Math.min(t, 3);
  const detail = still || (t >= 6 && t <= 10);
  const pressing = still || t === 8 || t === 9;

  return (
    <div className="relative h-full overflow-hidden bg-[#f4f4f5] text-[#111827]">
      {/* List */}
      <div
        className="absolute inset-0 flex flex-col px-4 pt-14 transition-transform duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]"
        style={{ transform: detail ? "translateX(-28%)" : "none" }}
      >
        <p className="text-[20px] font-semibold">Leads</p>
        <span className="mt-1 block h-[3px] w-7 rounded-full bg-[#8a6f5c]" />

        <div className="mt-5 flex gap-2 text-[11px]">
          <span className="rounded-full bg-[#111827] px-3 py-1.5 font-medium text-white">
            Active
          </span>
          <span className="rounded-full px-3 py-1.5 text-[#9ca3af]">Lost</span>
          <span className="rounded-full px-3 py-1.5 text-[#9ca3af]">Archived</span>
        </div>

        <div className="mt-4 space-y-2.5">
          {LEADS.map((l, i) => (
            <div
              key={l.n}
              className="flex items-center gap-3 rounded-2xl border border-black/5 bg-[#ffffff] px-3.5 py-3 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.12)] transition-all duration-500 ease-[cubic-bezier(0.34,1.3,0.5,1)]"
              style={{
                opacity: i < shown ? 1 : 0,
                transform: i < shown ? "none" : "translateY(14px) scale(0.96)",
              }}
            >
              <Mark src={l.src} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-[13px] font-semibold">{l.n}</p>
                  {l.tag && (
                    <span className="rounded-full bg-[var(--group)] px-1.5 py-0.5 text-[8px] font-bold uppercase text-white">
                      {l.tag}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[11px] text-[#9ca3af]">{l.m}</p>
              </div>
              <span className="text-[#d1d5db]">›</span>
            </div>
          ))}
        </div>

        <MiniNav />
      </div>

      {/* The lead itself, sliding in over the list */}
      <div
        className="absolute inset-0 flex flex-col bg-[#f4f4f5] px-4 pt-14 shadow-[-18px_0_40px_-20px_rgba(0,0,0,0.35)] transition-transform duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]"
        style={{ transform: detail ? "none" : "translateX(100%)" }}
      >
        <p className="text-[11px] text-[#9ca3af]">‹ Leads</p>
        <div className="mt-3 flex items-center gap-3">
          <Mark src={LEADS[0].src} size={30} />
          <div>
            <p className="text-[17px] font-semibold leading-tight">{LEADS[0].n}</p>
            <p className="text-[11px] text-[#9ca3af]">
              {LEADS[0].src.replace(" / Facebook", "")} · {LEADS[0].area}
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {[
            ["Phone", LEADS[0].tel],
            ["Enquiry", "Free market appraisal"],
            ["Stage", "New — not yet contacted"],
          ].map(([k, v]) => (
            <div
              key={k}
              className="rounded-2xl border border-black/5 bg-[#ffffff] px-3.5 py-2.5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.1)]"
            >
              <p className="text-[9px] font-bold uppercase tracking-widest text-[#9ca3af]">
                {k}
              </p>
              <p className="mt-0.5 text-[13px] font-medium">{v}</p>
            </div>
          ))}
        </div>

        {/* The press: scales in and lifts, as if tapped */}
        <div className="mt-4 flex gap-2">
          <span
            className="flex-1 rounded-full bg-[var(--group)] py-2.5 text-center text-[12px] font-semibold text-white transition-all duration-300"
            style={{
              transform: pressing ? "scale(0.96)" : "none",
              boxShadow: pressing
                ? "0 2px 8px -2px color-mix(in srgb, var(--group) 70%, transparent)"
                : "0 10px 22px -8px color-mix(in srgb, var(--group) 60%, transparent)",
            }}
          >
            Call now
          </span>
          <span className="rounded-full border border-black/10 px-4 py-2.5 text-center text-[12px] font-semibold text-[#111827]">
            Log
          </span>
        </div>

        <MiniNav />
      </div>
    </div>
  );
}

const BRANDS_DECK = [
  { tag: "Estate agents", name: ["The", "Property", "Experts"], fee: "£850", bg: "var(--group)" },
  { tag: "Mortgages", name: ["The", "Mortgage", "Experts"], fee: "£300", bg: "#2B6193" },
  { tag: "Lettings", name: ["The", "Lettings", "Experts"], fee: "£450", bg: "#A3C739" },
  { tag: "Commercial", name: ["Commercial", "Property", "Experts"], fee: "£1,200", bg: "#41AAE1" },
];

/* Referrals. The loop: flick through the brand deck → the refer button
   presses → confirmation that it's gone to the closest agent → repeat. */
function ReferralScreen({ running }: { running: boolean }) {
  const t = useTicker(running, 10);
  const still = t === STILL;
  const brand = BRANDS_DECK[still ? 0 : Math.min(t, 3) % BRANDS_DECK.length];
  const pressing = t === 4;
  const sent = still || (t >= 5 && t <= 7);

  return (
    <div className="flex h-full flex-col bg-[#f4f4f5] px-4 pt-14 text-[#111827]">
      <p className="text-[20px] font-semibold">Referrals</p>
      <span className="mt-1 block h-[3px] w-7 rounded-full bg-[#8a6f5c]" />

      <div className="mt-5 inline-flex w-fit rounded-full bg-[rgba(28,28,32,0.5)] p-1 text-[11px] backdrop-blur">
        <span className="rounded-full bg-white/[0.16] px-3.5 py-1.5 font-medium text-white">
          Send
        </span>
        <span className="rounded-full px-3.5 py-1.5 text-white/60">Received</span>
      </div>

      {/* Stacked brand cards, as they appear in the rolodex. The front card
          swaps as the deck is flicked through. */}
      <div className="relative mt-5 flex-1">
        <div className="absolute inset-x-4 top-0 h-24 rounded-[22px] bg-black/25" />
        <div className="absolute inset-x-2 top-3 h-28 rounded-[24px] bg-black/15" />
        <div
          className="absolute inset-x-0 top-7 flex h-[300px] flex-col rounded-[26px] p-5 text-white shadow-xl transition-all duration-500 ease-[cubic-bezier(0.34,1.25,0.5,1)]"
          style={{
            background: brand.bg,
            transform: sent ? "scale(0.97)" : "none",
            opacity: sent ? 0 : 1,
          }}
        >
          <span className="w-fit rounded-full bg-white/20 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide">
            {brand.tag}
          </span>
          <p className="mt-auto text-[26px] font-semibold leading-[0.95]">
            {brand.name.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </p>
          <p className="mt-4 text-[9px] font-bold uppercase tracking-widest text-white/70">
            You earn up to
          </p>
          <p className="text-[30px] font-semibold leading-none">{brand.fee}</p>
          <span
            className="mt-3 rounded-full bg-[#ffffff] py-2 text-center text-[12px] font-semibold transition-transform duration-300"
            style={{
              color: brand.bg,
              transform: pressing ? "scale(0.95)" : "none",
            }}
          >
            Refer a lead →
          </span>
        </div>

        {/* Sent confirmation, once the deck clears */}
        <div
          className="absolute inset-x-0 top-7 flex h-[300px] flex-col items-center justify-center rounded-[26px] border border-black/5 bg-[#ffffff] p-6 text-center shadow-xl transition-all duration-500"
          style={{
            opacity: sent ? 1 : 0,
            transform: sent ? "none" : "scale(0.97)",
          }}
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--group)] text-[22px] text-white">
            ✓
          </span>
          <p className="mt-4 text-[15px] font-semibold">Referral sent</p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-[#9ca3af]">
            Matched to the closest agent in that patch. You&apos;ll see it move
            through their pipeline right here.
          </p>
        </div>
      </div>

      <MiniNav active={2} />
    </div>
  );
}

// The real bottom nav: the same four icons as the app, plus the search circle.
const NAV_ICONS = [
  "M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10",
  "M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4z",
  "M8 7h12m0 0l-4-4m4 4l-4 4M16 17H4m0 0l4 4m-4-4l4-4",
  "M4 5h16a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1zm2 11l4-5 3 3 2-2 3 4M9 9.5a.5.5 0 11-1 0 .5.5 0 011 0z",
];

function MiniNav({ active = 1 }: { active?: number }) {
  return (
    <div className="mt-auto mb-4 flex items-center gap-2">
      <div className="flex flex-1 items-stretch rounded-full border border-white/10 bg-[rgba(28,28,32,0.62)] p-1.5 shadow-[0_10px_28px_-8px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.14)] backdrop-blur-xl">
        {NAV_ICONS.map((d, i) => (
          <span
            key={i}
            className={`flex flex-1 items-center justify-center rounded-full py-2 ${
              i === active ? "bg-white/[0.14]" : ""
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              className={`h-[18px] w-[18px] ${i === active ? "text-white" : "text-white/45"}`}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d={d} />
            </svg>
          </span>
        ))}
      </div>
      <span className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full border border-white/10 bg-[rgba(28,28,32,0.62)] shadow-[0_10px_28px_-8px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.14)] backdrop-blur-xl">
        <svg viewBox="0 0 24 24" className="h-[19px] w-[19px] text-white/85" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </svg>
      </span>
    </div>
  );
}
