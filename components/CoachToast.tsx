"use client";

// The nudge that keeps uncontacted leads from going cold.
//
// While the agent has at least one lead they haven't touched, a small
// pop-out reminds them why speed matters, at most once every 10 minutes
// (James, 7 Aug 2026 — including the interval). Both lines are real stats
// James supplied, not invented copy. No uncontacted leads -> never appears:
// this is a spur to action, not ambient decoration.
//
// Frequency state lives in localStorage, so navigating between pages (or
// reopening the PWA) doesn't reset the clock and turn "every 10 minutes"
// into "every page view".

import { useEffect, useState } from "react";

const EVERY_MS = 10 * 60 * 1000;
const SHOW_FOR_MS = 12_000;
const AT_KEY = "teg-coach-at";
const IDX_KEY = "teg-coach-idx";

const STATS = [
  {
    emoji: "⏱️",
    text: "Your conversion rate falls by half if a lead isn't contacted within two hours.",
  },
  {
    emoji: "📉",
    text: "After three attempts, conversion drops under 5% — the first call is the one that counts.",
  },
] as const;

export default function CoachToast({ uncontacted }: { uncontacted: number }) {
  const [showing, setShowing] = useState<number | null>(null);

  useEffect(() => {
    if (uncontacted <= 0) {
      setShowing(null);
      return;
    }
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    const maybeShow = () => {
      const last = Number(localStorage.getItem(AT_KEY) ?? 0);
      if (Date.now() - last < EVERY_MS) return;
      const idx = Number(localStorage.getItem(IDX_KEY) ?? 0) % STATS.length;
      localStorage.setItem(AT_KEY, String(Date.now()));
      localStorage.setItem(IDX_KEY, String(idx + 1));
      setShowing(idx);
      hideTimer = setTimeout(() => setShowing(null), SHOW_FOR_MS);
    };
    // A beat after load (let the dashboard settle), then every minute check
    // whether the 10 are up.
    const first = setTimeout(maybeShow, 4000);
    const tick = setInterval(maybeShow, 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(tick);
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, [uncontacted]);

  if (showing === null) return null;
  const stat = STATS[showing];

  return (
    <div
      role="status"
      className="fixed inset-x-4 z-[60] rounded-2xl border border-gray-200 bg-white/95 p-4 shadow-xl backdrop-blur transition-all"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 96px)" }}
    >
      <div className="flex items-start gap-3">
        <span className="text-xl">{stat.emoji}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-snug text-gray-900">
            {stat.text}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {uncontacted === 1
              ? "You have 1 lead waiting on a first contact."
              : `You have ${uncontacted} leads waiting on a first contact.`}
          </p>
        </div>
        <button
          aria-label="Dismiss"
          onClick={() => setShowing(null)}
          className="shrink-0 p-1 text-gray-400"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
