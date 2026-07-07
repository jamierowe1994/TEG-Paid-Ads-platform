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
      lerp: 0.08, // lower = floatier
      smoothWheel: true,
      wheelMultiplier: 0.9,
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
