"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/* The trust section — sits between "What is Launch Pad?" and "How it works",
   so the order reads: what it is → why you can believe it → how it runs.

   IMPORTANT: these are real figures from the three-month trial, taken from the
   partner pack ("TEG - LAUNCHPAD - Leads for our Partners"): 208,999
   impressions and 555 leads. They go out to prospects as a genuine result, and
   this repo auto-deploys on push — do not round them up, embellish them, or add
   a cost-per-lead until the trial's actual ad spend is confirmed. LEADS / MONTH
   is derived from the two figures above, not a separate claim. */

const LEADS = 555;
const IMPRESSIONS = 208999;
const MONTHS = 3;

const SUPPORTING = [
  {
    value: IMPRESSIONS,
    label: "Times the ads were seen",
    sub: "Across one agent's patch",
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

function useCountUp(target: number, on: boolean, duration = 2200) {
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

function Stat({
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
    <div className="px-4 text-center">
      <p className="text-4xl font-light tabular-nums tracking-[-0.03em] text-white sm:text-5xl">
        {n.toLocaleString("en-GB")}
      </p>
      <p className="mt-3 text-sm font-medium text-white/70">{label}</p>
      <p className="mt-1 text-sm text-white/35">{sub}</p>
    </div>
  );
}

export default function TrialProof() {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
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
    <div ref={ref} className="relative mx-auto max-w-5xl px-6">
      {/* Brand-red bloom behind the numbers — the only colour in the section,
          so the figures themselves stay white and legible on charcoal. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-40 -z-10 h-[420px] w-[min(92vw,860px)] -translate-x-1/2 rounded-full opacity-25 blur-[120px]"
        style={{
          background:
            "radial-gradient(50% 50% at 50% 50%, #a72a35 0%, transparent 72%)",
        }}
      />

      <div className="text-center">
        <span className="inline-block rounded-full bg-[#A72A35] px-4 py-1.5 text-sm font-medium text-white">
          Flight tested
        </span>
        <h2 className="mx-auto mt-5 max-w-3xl text-4xl font-light leading-[1.05] tracking-[-0.035em] text-white sm:text-5xl">
          We ran it for three months before we offered it to you.
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-white/60">
          One agent. One patch. The same ads, the same dashboard and the same
          lead nurture you&apos;d get on day one — no special treatment. Here is
          exactly what came back.
        </p>
      </div>

      {/* The headline number. Everything else on this page is supporting cast. */}
      <div className="mt-14 text-center">
        <p className="text-[5.5rem] font-light leading-[0.85] tabular-nums tracking-[-0.055em] text-white sm:text-[9.5rem]">
          {leads.toLocaleString("en-GB")}
        </p>
        <p className="mt-5 text-lg text-white/70 sm:text-xl">
          leads delivered, in three months, to one agent
        </p>
      </div>

      {/* No card, no rules — the figures sit straight on the page so the 555
          above stays the only thing with weight. */}
      <div className="mt-16 grid gap-12 sm:grid-cols-3 sm:gap-8">
        {SUPPORTING.map((s) => (
          <Stat key={s.label} {...s} on={on} />
        ))}
      </div>

      <div className="mt-12 text-center">
        <p className="mx-auto max-w-lg text-lg text-white/70">
          That was one patch, for three months. Yours is still open.
        </p>
        <div className="mt-7">
          <Link
            href="/signup"
            className="btn-group inline-block rounded-full px-9 py-4 text-base font-semibold"
          >
            Choose your package
          </Link>
        </div>
        <p className="mt-6 text-xs text-white/30">
          Real figures from The Experts Group&apos;s three-month Launch Pad
          trial. Meta campaigns only — LinkedIn is next.
        </p>
      </div>
    </div>
  );
}
