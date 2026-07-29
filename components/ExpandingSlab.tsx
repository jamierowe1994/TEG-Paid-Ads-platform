"use client";

import { useEffect, useRef } from "react";

// A section that enters as a near-circle: its top edge starts as a deep dome
// (vertical radius ~55% of the viewport) and relaxes flat as it climbs, so
// it feels like it's expanding outwards while moving up. Children tagged
// .par-slow / .par-fast ride at different speeds (a light parallax), so the
// arrival flows rather than sliding in as one rigid slab. Used by the
// pricing section.
export default function ExpandingSlab({
  id,
  className = "",
  children,
}: {
  id?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
      return; // keep the static CSS radius; no parallax
    }
    let raf = 0;

    const update = () => {
      raf = 0;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      // 1 as the top edge enters at the bottom of the screen → 0 once docked.
      const t = Math.max(0, Math.min(1, rect.top / vh));
      const r = t * vh * 0.55;
      el.style.borderRadius = `50% 50% 0 0 / ${r.toFixed(1)}px ${r.toFixed(1)}px 0 0`;

      // Parallax: the deeper into the section, the more each layer has
      // caught up; both settle to 0 as the slab docks.
      const lag = Math.max(0, rect.top);
      const slow = el.querySelector<HTMLElement>(".par-slow");
      const fast = el.querySelector<HTMLElement>(".par-fast");
      if (slow) slow.style.transform = `translateY(${(lag * 0.15).toFixed(1)}px)`;
      if (fast) fast.style.transform = `translateY(${(lag * 0.32).toFixed(1)}px)`;
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

  return (
    <section ref={ref} id={id} className={className}>
      {children}
    </section>
  );
}
