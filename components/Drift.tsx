"use client";

import { useEffect, useRef } from "react";

/* Scroll-linked drift. The element is nudged vertically based on how far it
   is from the centre of the viewport, so two Drifts with different speeds
   separate as you scroll and close back up — a parallax between the copy and
   the phone rather than the whole block moving as one slab.

   Negative speed drifts against the scroll (rises faster), positive with it.

   Deliberately NOT used inside the sticky stack: a transform on an ancestor
   makes that element the containing block for fixed/sticky descendants, which
   is exactly what killed the stacking effect the first time round. */
export default function Drift({
  children,
  speed = 0.08,
  className = "",
}: {
  children: React.ReactNode;
  speed?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
    // The drift is decoration; below lg the columns stack and it just fights
    // the reading order.
    if (!window.matchMedia?.("(min-width: 1024px)")?.matches) return;

    let raf = 0;
    const update = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const fromCentre = r.top + r.height / 2 - window.innerHeight / 2;
      el.style.transform = `translate3d(0, ${(-fromCentre * speed).toFixed(2)}px, 0)`;
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
  }, [speed]);

  return (
    <div ref={ref} className={className} style={{ willChange: "transform" }}>
      {children}
    </div>
  );
}
