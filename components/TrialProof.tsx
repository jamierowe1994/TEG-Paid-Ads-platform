"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import MobileSheet from "./MobileSheet";

/* The trust section — sits between "What is Launch Pad?" and "How it works",
   so the order reads: what it is → why you can believe it → how it runs.

   IMPORTANT: these are real figures from the three-month trial, taken from the
   partner pack ("TEG - LAUNCHPAD - Leads for our Partners"): 208,999
   impressions and 555 leads. They go out to prospects as a genuine result, and
   this repo auto-deploys on push — do not round them up, embellish them, or add
   a cost-per-lead until the trial's actual ad spend is confirmed. LEADS / MONTH
   is derived from the two figures above, not a separate claim.

   The trial ran with Jon at The Lettings Experts, covering Edinburgh. Named
   with permission — if that ever changes, take the name out rather than
   softening it back to "one agent", which reads as though we're hiding
   something. */

export const LEADS = 555;
const IMPRESSIONS = 208999;
const MONTHS = 3;

export const SUPPORTING = [
  {
    value: IMPRESSIONS,
    label: "Times the ads were seen",
    sub: "Across Edinburgh",
  },
  {
    value: Math.round(LEADS / MONTHS),
    label: "Leads a month, on average",
    sub: "Landing straight in the dashboard",
  },
  {
    value: MONTHS,
    label: "Months, start to finish",
    sub: "Meta campaigns only",
  },
];

export function useCountUp(target: number, on: boolean, duration = 2200) {
  const [n, setN] = useState(0);

  useEffect(() => {
    if (!on) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
      setN(target);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min((t - t0) / duration, 1);
      // Ease-out cubic, same curve as the dashboard infographic.
      setN(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [on, target, duration]);

  return n;
}

export function Stat({
  value,
  label,
  sub,
  on,
}: {
  value: number;
  label: string;
  sub: string;
  on: boolean;
}) {
  const n = useCountUp(value, on);
  return (
    <div className="text-center sm:text-left">
      <p className="text-4xl font-light tabular-nums tracking-[-0.03em] text-gray-900 sm:text-5xl">
        {n.toLocaleString("en-GB")}
      </p>
      <p className="mt-3 text-sm font-medium text-gray-600">{label}</p>
      <p className="mt-1 text-sm text-gray-400">{sub}</p>
    </div>
  );
}

export default function TrialProof() {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  // Mobile: the supporting figures live behind a tap (the page runs long
  // enough on a phone as it is).
  const [statsOpen, setStatsOpen] = useState(false);
  const leads = useCountUp(LEADS, on, 2600);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setOn(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setOn(true);
          observer.disconnect();
        }
      },
      { threshold: 0.25 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="relative mx-auto w-full max-w-7xl px-6 sm:px-10">
      {/* Deliberately off the centre line: copy holds a narrow column on the
          left while the number runs oversized on the right, so this section
          doesn't read as another centred block like the ones either side. */}
      {/* items-start so the 555 tops out level with "We ran…" instead of
          hanging vertically centred beside it. */}
      <div className="grid items-start gap-14 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-20">
        <div className="max-w-xl max-sm:hidden">
          <h2 className="text-4xl font-light leading-[1.05] tracking-[-0.035em] text-gray-900 max-sm:hidden sm:text-5xl">
            We ran it for three months before we offered it to you.
          </h2>
          <p className="mt-6 text-lg leading-relaxed text-gray-600">
            These are the results we managed to get for Jon at The Lettings
            Experts, covering Edinburgh. Here&apos;s what came back.
          </p>
          <p className="mt-8 text-lg text-gray-600 max-sm:hidden">
            That was one location, for three months. Yours is still open.
          </p>
        </div>

        {/* The headline number. Everything else here is supporting cast.
            The CTA lives under it, on the opposite side to every other
            button on the page — same glass pill as the hero's, always. */}
        <div className="lg:text-right">
          <p className="text-[7rem] font-light leading-[0.78] tabular-nums tracking-[-0.06em] text-gray-900 sm:text-[11rem] lg:text-[14rem]">
            {leads.toLocaleString("en-GB")}
          </p>
          <p className="mt-5 max-w-[15rem] text-lg text-gray-600 max-sm:hidden lg:ml-auto">
            leads delivered to Jon, in three months
          </p>
          {/* Mobile only. The desktop column above says this across a heading,
              this caption and a closing line; on a phone that's the same fact
              three times before you reach a number. One line instead. */}
          <p className="mt-5 text-lg leading-relaxed text-gray-600 sm:hidden">
            These are the results we got from Jon for The Lettings Experts,
            covering Edinburgh. Here&apos;s what came back.
          </p>
          {/* Mobile: the rest of the trial's numbers, one tap away — sits
              right under the headline figure, before the CTA. */}
          <button
            onClick={() => setStatsOpen(true)}
            className="mt-7 flex items-center gap-3 text-sm font-semibold text-gray-900 sm:hidden"
          >
            <span
              aria-hidden
              className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-300 text-lg font-light leading-none text-gray-700"
            >
              +
            </span>
            The trial, in numbers
          </button>
          <div className="mt-8 flex lg:justify-end">
            <Link
              href="/signup"
              className="btn-hero-glass px-9 py-4 text-base font-medium"
            >
              Choose your package
            </Link>
          </div>
        </div>
      </div>

      {/* Supporting figures run the full width under a hairline — no cards,
          so the 555 stays the only thing with real weight. Desktop/tablet
          only; on mobile they collapse behind the button below. */}
      <div className="mt-24 grid gap-12 border-t border-gray-900/10 pt-12 max-sm:hidden sm:grid-cols-3 sm:gap-8">
        {SUPPORTING.map((s) => (
          <Stat key={s.label} {...s} on={on} />
        ))}
      </div>

      <MobileSheet
        open={statsOpen}
        onClose={() => setStatsOpen(false)}
        title="The trial, in numbers"
      >
        <div className="space-y-9 pb-2 pt-3">
          {SUPPORTING.map((s) => (
            <Stat key={s.label} {...s} on={statsOpen} />
          ))}
        </div>
      </MobileSheet>
    </div>
  );
}
