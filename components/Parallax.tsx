"use client";

import { useEffect, useRef } from "react";

// Parallax movement, two modes:
//  - "scroll": drifts down as the page scrolls (hero lag). Uses window.scrollY.
//  - "element": movement is relative to the element's own position in the
//    viewport — it rises up as it enters from below, settles at 0 when centred
//    (its natural spot), then drifts down as it leaves. This is what lets an
//    incoming section "come up to meet" the one above it, then flow down with
//    the scroll. Pairs with Lenis for a fluid, movement-based feel.
// Disabled for reduced-motion.

export default function Parallax({
  mode = "scroll",
  speed = 0.32,
  strength = -110,
  max = 300,
  className = "",
  children,
}: {
  mode?: "scroll" | "element";
  speed?: number;
  strength?: number;
  max?: number;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;

    const onScroll = () => {
      if (mode === "element") {
        const rect = el.getBoundingClientRect();
        const winH = window.innerHeight || 800;
        const centre = rect.top + rect.height / 2;
        const fromCentre = (centre - winH / 2) / winH; // >0 below centre
        const shift = Math.max(-max, Math.min(max, fromCentre * strength));
        el.style.transform = `translate3d(0, ${shift}px, 0)`;
      } else {
        const shift = Math.min(window.scrollY * speed, max);
        el.style.transform = `translate3d(0, ${shift}px, 0)`;
      }
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [mode, speed, strength, max]);

  return (
    <div ref={ref} className={className} style={{ willChange: "transform" }}>
      {children}
    </div>
  );
}
