"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import HowItWorksPhone from "./HowItWorksPhone";
import { LEADS, SUPPORTING, Stat, useCountUp } from "./TrialProof";

// The desktop proof → "How it works" presentation. One pinned, full-screen,
// light-grey stage that two "slides" share — the page appears stationary
// while the content moves, so it never reads as scrolling to the next
// section:
//
//   1. The heading and copy are on screen from the very first frame — they
//      start high and travel down to their resting spot as you scroll, so
//      the section is never blank. The figures then pop on one by one (each
//      starting its count-up as it lands), and the 555 and the glass CTA
//      arrive TOGETHER as the finale. The screen then holds for a good beat.
//   2. Everything flies OFF the top, line by line from the top down, while
//      the phone is already rising from the bottom — the handover overlaps
//      heavily, so the phone is around mid-screen by the time the figures
//      are on their way out. No dead frames.
//   3. The phone slides to its right-hand column and the "How it works" copy
//      fades up on the left. The stage then releases and the page scrolls on
//      normally into the next section.
//
// The region is 450vh: pinned for 350vh, phases spread across all of it.

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (t: number) => t * t * (3 - 2 * t);

// Per-element windows in scene progress (0–1 across 350vh of scroll).
// `always` elements are visible from the start (they only settle downward
// and later fly off). `in` reveals (rise + fade over 0.05); `out` flies off
// the top (over 0.08), in document order, top of the screen first.
const SEQ: Record<string, { in: number; out: number; always?: boolean }> = {
  head: { in: 0, out: 0.52, always: true },
  p1: { in: 0, out: 0.535, always: true },
  p2: { in: 0, out: 0.55, always: true },
  rule: { in: 0.06, out: 0.585 },
  f0: { in: 0.09, out: 0.6 },
  f1: { in: 0.14, out: 0.615 },
  f2: { in: 0.19, out: 0.63 },
  big: { in: 0.25, out: 0.565 },
  btn: { in: 0.25, out: 0.565 },
};
const WIN = 0.05;
const WOUT = 0.08;
// The always-on copy starts this much higher and settles by p=0.24 — it
// "covers the distance" with the scroll instead of sitting static.
const SETTLE = 140;

// Phone/copy phases. The rise starts as the exit begins, so the two slides
// pass each other mid-screen.
const RISE = { from: 0.5, to: 0.74 };
const MOVE = { from: 0.76, to: 0.87 };
const COPY = { from: 0.84, to: 0.94 };

export default function ProofHowScene() {
  const region = useRef<HTMLDivElement>(null);
  const els = useRef<Record<string, HTMLElement | null>>({});
  const setEl = (k: string) => (n: HTMLElement | null) => {
    els.current[k] = n;
  };

  // Count-ups fire the moment their beat lands. Short durations — the beat
  // structure already paces the section.
  const [statOn, setStatOn] = useState([false, false, false]);
  const [bigOn, setBigOn] = useState(false);
  const leads = useCountUp(LEADS, bigOn, 1300);

  useEffect(() => {
    const el = region.current;
    if (!el) return;

    const copyEl = el.querySelector<HTMLElement>(".hiw-copy");
    const phoneEl = el.querySelector<HTMLElement>(".hiw-phone");
    const grid = copyEl?.parentElement;

    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
      // No choreography: everything visible, counters running.
      setStatOn([true, true, true]);
      setBigOn(true);
      Object.values(els.current).forEach((n) => {
        if (n) n.style.opacity = "1";
      });
      if (copyEl) copyEl.style.opacity = "1";
      return;
    }

    let raf = 0;
    const update = () => {
      raf = 0;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const denom = el.offsetHeight - vh;
      const p = clamp01(-rect.top / denom);
      // The always-on copy travelling down to its resting spot.
      const settle = -(1 - smooth(clamp01(p / 0.24))) * SETTLE;

      for (const [k, cfg] of Object.entries(SEQ)) {
        const n = els.current[k];
        if (!n) continue;
        const inP = cfg.always ? 1 : smooth(clamp01((p - cfg.in) / WIN));
        const outP = smooth(clamp01((p - cfg.out) / WOUT));
        const y =
          (cfg.always ? settle : (1 - inP) * 44) + outP * -1.15 * vh;
        n.style.opacity = String(inP);
        n.style.transform = `translateY(${y.toFixed(1)}px)`;
      }

      // Count-up triggers (never un-trigger).
      setStatOn((prev) => {
        const next: [boolean, boolean, boolean] = [
          prev[0] || p >= SEQ.f0.in,
          prev[1] || p >= SEQ.f1.in,
          prev[2] || p >= SEQ.f2.in,
        ];
        return next[0] === prev[0] && next[1] === prev[1] && next[2] === prev[2]
          ? prev
          : next;
      });
      setBigOn((prev) => prev || p >= SEQ.big.in);

      // Slide two: the phone rises into the centre, slides right, and the
      // copy fades up.
      const rise = smooth(clamp01((p - RISE.from) / (RISE.to - RISE.from)));
      const move = smooth(clamp01((p - MOVE.from) / (MOVE.to - MOVE.from)));
      const copy = smooth(clamp01((p - COPY.from) / (COPY.to - COPY.from)));
      if (phoneEl && grid) {
        const shift = grid.offsetWidth / 2 - 165;
        const x = -(1 - move) * shift;
        const y = (1 - rise) * vh * 1.05;
        phoneEl.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      }
      if (copyEl) {
        copyEl.style.opacity = String(copy);
        copyEl.style.transform = `translateY(${((1 - copy) * 32).toFixed(1)}px)`;
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Later beats start invisible; the scroll loop drives it all. The
  // heading/copy (always-on) stay visible from the first paint.
  const hidden = { opacity: 0 } as React.CSSProperties;

  return (
    <div ref={region} className="relative h-[450vh]">
      <div className="sticky top-0 flex h-screen flex-col justify-center overflow-hidden bg-[#f4f4f5]">
        {/* ── Slide one: the proof, centred on the full screen ─────────── */}
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-center">
          <div className="mx-auto w-full max-w-7xl px-10">
            <div className="grid items-start gap-14 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-20">
              <div className="max-w-xl">
                <h2
                  ref={setEl("head")}
                  className="text-4xl font-light leading-[1.05] tracking-[-0.035em] text-gray-900 sm:text-5xl"
                >
                  We ran it for three months before we offered it to you.
                </h2>
                <p
                  ref={setEl("p1")}
                  className="mt-6 text-lg leading-relaxed text-gray-600"
                >
                  One agent. One patch. The same ads, the same dashboard and
                  the same lead nurture you&apos;d get on day one — no special
                  treatment. Here is exactly what came back.
                </p>
                <p
                  ref={setEl("p2")}
                  className="mt-8 text-lg text-gray-600"
                >
                  That was one patch, for three months. Yours is still open.
                </p>
              </div>
              {/* The 555 lands second-to-last; the CTA is the finale. */}
              <div className="lg:text-right">
                <div ref={setEl("big")} style={hidden}>
                  <p className="text-[7rem] font-light leading-[0.78] tabular-nums tracking-[-0.06em] text-gray-900 sm:text-[11rem] lg:text-[13rem]">
                    {leads.toLocaleString("en-GB")}
                  </p>
                  <p className="mt-5 max-w-[15rem] text-lg text-gray-600 lg:ml-auto">
                    leads delivered, in three months, to one agent
                  </p>
                </div>
                <div
                  ref={setEl("btn")}
                  style={hidden}
                  className="mt-8 flex lg:justify-end"
                >
                  <Link
                    href="/signup"
                    className="btn-hero-glass pointer-events-auto px-9 py-4 text-base font-medium"
                  >
                    Choose your package
                  </Link>
                </div>
              </div>
            </div>

            <div
              ref={setEl("rule")}
              style={hidden}
              className="mt-16 border-t border-gray-900/10"
            />
            <div className="mt-10 grid gap-12 sm:grid-cols-3 sm:gap-8">
              {SUPPORTING.map((s, i) => (
                <div key={s.label} ref={setEl(`f${i}`)} style={hidden}>
                  <Stat {...s} on={statOn[i]} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Slide two: the phone and the how-it-works copy ───────────── */}
        <div className="relative mx-auto w-full max-w-6xl px-6">
          <HowItWorksPhone />
        </div>
      </div>
    </div>
  );
}
