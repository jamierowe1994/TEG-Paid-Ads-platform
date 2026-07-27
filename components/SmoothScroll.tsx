"use client";

import { useEffect } from "react";
import Lenis from "lenis";

// Lenis smooth scrolling for the landing page — a floaty, eased scroll. It
// virtualises the window scroll but still updates window.scrollY and fires
// scroll events, so the parallax and reveal-on-scroll logic keep working
// (and feel smoother). Disabled for reduced-motion.

export default function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;

    const lenis = new Lenis({
      // Higher = tighter. 0.08 was floaty enough that the page kept drifting
      // after you'd stopped scrolling; this still smooths but settles quickly.
      lerp: 0.16,
      smoothWheel: true,
      wheelMultiplier: 1,
    });

    let raf = 0;
    const loop = (time: number) => {
      lenis.raf(time);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
    };
  }, []);

  return null;
}
