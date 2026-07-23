"use client";

import type { ReactNode } from "react";

// Shown to referrals-only accounts when they open a Paid-Ads page (Overview,
// Leads, All Ads). Rather than bounce them away, we render the real page —
// blurred and non-interactive — behind a clear "Activate Paid Ads" card, so
// it's obvious the page exists and what unlocks it. The CTA drops them on the
// billing/upgrade section of their profile.
export default function PaidLockOverlay({
  children,
  accent,
  title,
  blurb,
  onActivate,
}: {
  children: ReactNode;
  accent: string;
  title: string;
  blurb: string;
  onActivate: () => void;
}) {
  return (
    <div className="relative min-h-[70vh]">
      {/* The real page, blurred out as a backdrop */}
      <div
        aria-hidden
        className="pointer-events-none select-none opacity-70 blur-[6px] saturate-[0.6]"
      >
        {children}
      </div>

      {/* Soft wash so the card reads over any page */}
      <div className="absolute inset-0 bg-white/40" aria-hidden />

      {/* The call-to-action */}
      <div className="absolute inset-0 flex items-start justify-center px-4 pt-16 sm:pt-24">
        <div className="w-full max-w-md rounded-3xl border border-gray-200 bg-white/95 p-8 text-center shadow-2xl backdrop-blur">
          <span
            className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{ backgroundColor: `${accent}1a` }}
          >
            <svg
              className="h-7 w-7"
              fill="none"
              stroke={accent}
              strokeWidth={1.8}
              viewBox="0 0 24 24"
            >
              <rect x="5" y="11" width="14" height="9" rx="2" />
              <path d="M8 11V8a4 4 0 018 0v3" strokeLinecap="round" />
            </svg>
          </span>
          <h2 className="mt-5 text-xl font-semibold tracking-tight text-gray-900">
            {title}
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-gray-500">
            {blurb}
          </p>
          <button
            onClick={onActivate}
            className="mt-6 inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
            style={{ backgroundColor: accent }}
          >
            Activate Paid Ads
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
          <p className="mt-3 text-xs text-gray-400">
            Keep using Referrals free — activate Paid Ads whenever you&apos;re ready.
          </p>
        </div>
      </div>
    </div>
  );
}
