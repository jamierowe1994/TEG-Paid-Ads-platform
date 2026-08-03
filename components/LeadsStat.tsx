"use client";

import { useEffect, useRef, useState } from "react";

// The white infographic card on the red panel. The card itself stays put —
// but as it scrolls into view the percentage counts up from 0 to 41 and the
// bars spring up from the baseline with a bounce.

const TARGET = 41;

export default function LeadsStat({
  className = "",
  startDelay = 0,
}: {
  className?: string;
  startDelay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  const [count, setCount] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (
      typeof IntersectionObserver === "undefined" ||
      window.innerHeight === 0
    ) {
      setOn(true);
      setCount(TARGET);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          // Wait for the card's expand animation before ticking up.
          const t = setTimeout(() => setOn(true), startDelay);
          observer.disconnect();
          return () => clearTimeout(t);
        }
      },
      { threshold: 0.25 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [startDelay]);

  // Count up with an ease-out once visible.
  useEffect(() => {
    if (!on) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
      setCount(TARGET);
      return;
    }
    const t0 = performance.now();
    const duration = 2800;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min((t - t0) / duration, 1);
      setCount(Math.round(TARGET * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [on]);

  return (
    <div
      ref={ref}
      // Mobile: tucked over the photo's bottom-left corner (the photo runs
      // nearly full-bleed there, so hanging off the left edge put the card
      // half off the page). sm+ keeps the original hang.
      className={`absolute -left-4 bottom-10 w-48 rounded-2xl bg-[#ffffff]/92 p-4 shadow-2xl backdrop-blur-md max-sm:-bottom-6 max-sm:left-4 ${className} sm:-left-8`}
      style={{ transformOrigin: "center" }}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-[#9ca3af]">
        Leads this month
      </p>
      <p className="mt-1 text-3xl font-semibold text-[var(--group)]">↑ {count}%</p>
      <div className="mt-3 flex items-end gap-2">
        <div
          className={`bar-grow h-8 flex-1 rounded-md bg-red-100 ${on ? "grown" : ""}`}
        />
        <div
          className={`bar-grow h-12 flex-1 rounded-md bg-[var(--group)] ${on ? "grown" : ""}`}
          style={{ animationDelay: "0.4s" }}
        />
      </div>
      <p className="mt-2 text-[10px] text-[#9ca3af]">vs last month</p>
    </div>
  );
}
