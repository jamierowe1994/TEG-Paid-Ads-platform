"use client";

import type { ReactNode } from "react";

// A locked page: the real thing rendered blurred and non-interactive behind a
// card explaining what unlocks it. Used in two places, which is why the CTA and
// footnote are props rather than fixed copy:
//
//   · A referrals-only account opening a Paid-Ads page → "Activate Paid Ads".
//   · Anyone opening Referrals before V2 → no CTA at all, because there is
//     nothing they can do to unlock it yet. A button that can't help is worse
//     than no button.
//
// Showing the page rather than bouncing them away is the point: they can see
// what's there and why it's shut.
export default function PaidLockOverlay({
  children,
  accent,
  title,
  blurb,
  onActivate,
  cta = "Activate Paid Ads",
  footnote = "Keep using Referrals free — activate Paid Ads whenever you're ready.",
}: {
  children: ReactNode;
  accent: string;
  title: string;
  blurb: string;
  /** Omitted together with `cta` for a lock the user can't act on. */
  onActivate?: () => void;
  /** Null hides the button entirely. */
  cta?: string | null;
  footnote?: string | null;
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
          {cta && onActivate && (
            <button
              onClick={onActivate}
              className="mt-6 inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
              style={{ backgroundColor: accent }}
            >
              {cta}
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          )}
          {footnote && (
            <p className="mt-3 text-xs text-gray-400">{footnote}</p>
          )}
        </div>
      </div>
    </div>
  );
}
