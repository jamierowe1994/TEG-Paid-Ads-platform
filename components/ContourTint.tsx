"use client";

import { useEffect } from "react";

// Drives the background contour colour (--contour) from grey to red and back
// as a target section passes the middle of the viewport — so the circles
// showing through the transparent "Built for agents" glass panel light up red
// while you scroll through it, then fade back to grey on the way out.

const GREY: [number, number, number] = [217, 220, 226]; // #d9dce2
const RED: [number, number, number] = [227, 31, 54]; // #E31F36

function lerp(a: number, b: number, t: number) {
  return Math.round(a + (b - a) * t);
}

export default function ContourTint({ targetId }: { targetId: string }) {
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
    const root = document.documentElement;
    let raf = 0;

    const update = () => {
      raf = 0;
      const el = document.getElementById(targetId);
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const winH = window.innerHeight || 800;
      const centre = rect.top + rect.height / 2;
      // 0 when the section centre is far from the viewport centre, 1 when
      // they align — reaches full red as the panel sits in the middle.
      const dist = Math.abs(centre - winH / 2) / (winH * 0.65);
      const t = Math.max(0, Math.min(1, 1 - dist));
      root.style.setProperty(
        "--contour",
        `rgb(${lerp(GREY[0], RED[0], t)}, ${lerp(GREY[1], RED[1], t)}, ${lerp(
          GREY[2],
          RED[2],
          t
        )})`
      );
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
      cancelAnimationFrame(raf);
      root.style.removeProperty("--contour");
    };
  }, [targetId]);

  return null;
}
