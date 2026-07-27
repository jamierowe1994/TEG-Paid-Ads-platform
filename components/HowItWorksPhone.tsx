"use client";

import { useState } from "react";

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

export default function HowItWorksPhone() {
  const [tab, setTab] = useState<TabId>("ads");

  return (
    <div className="grid items-start gap-16 lg:grid-cols-2">
      <div>
        <h2 className="text-4xl font-semibold tracking-tight text-white">
          How it works
        </h2>
        <p className="mt-3 max-w-md text-white/55">
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

        <ol className="mt-10 min-h-[430px] space-y-7">
          {STEPS[tab].map((s) => (
            <li key={s.n} className="flex gap-5">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 text-sm font-semibold text-white/80">
                {s.n}
              </span>
              <div>
                <p className="text-lg font-semibold text-white">{s.title}</p>
                <p className="mt-1.5 max-w-md leading-relaxed text-white/55">
                  {s.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {/* Phone — the frame never moves; the screen slides between the two. */}
      <div className="relative flex justify-center lg:sticky lg:top-24 lg:justify-end">
        {/* A soft red bloom so the phone's edges separate from the black. */}
        <span
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 h-[560px] w-[460px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-70 blur-[90px] lg:left-auto lg:right-[40px] lg:translate-x-0"
          style={{ background: "radial-gradient(circle, rgba(227,31,54,0.30), rgba(227,31,54,0.10) 55%, transparent 72%)" }}
        />
        <PhoneFrame tab={tab} />
      </div>
    </div>
  );
}

function PhoneFrame({ tab }: { tab: TabId }) {
  return (
    <div className="relative w-[300px] shrink-0 rounded-[44px] border-[7px] border-[#1c1c20] bg-[#f4f4f5] shadow-[0_40px_90px_-30px_rgba(0,0,0,0.9),0_0_0_1px_rgba(255,255,255,0.12)]">
      {/* Dynamic-island style pill */}
      <div className="absolute left-1/2 top-2.5 z-20 h-[22px] w-[86px] -translate-x-1/2 rounded-full bg-[#1c1c20]" />
      <div className="relative h-[600px] overflow-hidden rounded-[37px]">
        {/* Both screens sit side by side and slide, so the handset itself
            stays put — only its display changes. */}
        <div
          className="flex h-full w-[200%] transition-transform duration-[600ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
          style={{ transform: tab === "ads" ? "translateX(0)" : "translateX(-50%)" }}
        >
          <div className="h-full w-1/2"><AdsScreen /></div>
          <div className="h-full w-1/2"><ReferralScreen /></div>
        </div>
      </div>
    </div>
  );
}

// A cut-down version of the real Leads screen.
function AdsScreen() {
  return (
    <div className="flex h-full flex-col bg-[#f4f4f5] px-4 pt-14 text-[#111827]">
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
        {[
          { n: "Sarah Whitfield", m: "Landed 09:12", tag: "New" },
          { n: "Tom Baker", m: "Attempt 2 · 18 Jul" },
          { n: "Priya Shah", m: "Attempt 1 · 17 Jul" },
        ].map((l) => (
          <div
            key={l.n}
            className="flex items-center gap-3 rounded-2xl border border-black/5 bg-[#ffffff] px-3.5 py-3 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.12)]"
          >
            <span className="h-10 w-10 shrink-0 rounded-xl bg-gradient-to-br from-[#f09433] via-[#dc2743] to-[#bc1888]" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-[13px] font-semibold">{l.n}</p>
                {l.tag && (
                  <span className="rounded-full bg-[#E31F36] px-1.5 py-0.5 text-[8px] font-bold uppercase text-white">
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
  );
}

// A cut-down version of the Refer & earn deck.
function ReferralScreen() {
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

      {/* Stacked brand cards, as they appear in the rolodex */}
      <div className="relative mt-5 flex-1">
        <div className="absolute inset-x-4 top-0 h-24 rounded-[22px] bg-[#7d1620]" />
        <div className="absolute inset-x-2 top-3 h-28 rounded-[24px] bg-[#a4192a]" />
        <div className="absolute inset-x-0 top-7 flex h-[300px] flex-col rounded-[26px] bg-[#E31F36] p-5 text-white shadow-xl">
          <span className="w-fit rounded-full bg-white/20 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide">
            Estate agents
          </span>
          <p className="mt-auto text-[26px] font-semibold leading-[0.95]">
            The
            <br />
            Property
            <br />
            Experts
          </p>
          <p className="mt-4 text-[9px] font-bold uppercase tracking-widest text-white/70">
            You earn up to
          </p>
          <p className="text-[30px] font-semibold leading-none">£850</p>
          <span className="mt-3 rounded-full bg-[#ffffff] py-2 text-center text-[12px] font-semibold text-[#E31F36]">
            Refer a lead →
          </span>
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
