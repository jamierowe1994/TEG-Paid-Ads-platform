"use client";

// Mobile-only differential scroll for the "What is Launch Pad?" section.
//
// Children marked .mp-lead and .mp-follow ride at different speeds as the
// section crosses the viewport: the heading drifts up a little faster than the
// copy, so the gap between them closes as you scroll into it and opens again
// as you leave. Small movement, deliberately — the point is that the block
// feels alive rather than that anything obviously animates.
//
// Same idiom as ExpandingSlab's .par-slow / .par-fast, kept separate because
// this one measures its own section and switches itself off above `sm`.
//
// DESKTOP IS UNTOUCHED. The desktop layout is a two-column composition with a
// photo, and shifting type inside it would fight the grid rather than help it.

import { useEffect, useRef } from "react";

export default function MobileParallax({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const phone = window.matchMedia("(max-width: 639px)");
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");

    const lead = el.querySelector<HTMLElement>(".mp-lead");
    const follow = el.querySelector<HTMLElement>(".mp-follow");

    const clear = () => {
      if (lead) lead.style.transform = "";
      if (follow) follow.style.transform = "";
    };

    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const r = el.getBoundingClientRect();
        const vh = window.innerHeight || 1;
        // 0 as the section enters from the bottom, 1 once it's left the top.
        const p = Math.max(0, Math.min(1, 1 - (r.top + r.height * 0.35) / vh));
        // The heading travels further, so the gap between the two closes.
        if (lead) lead.style.transform = `translateY(${(-p * 26).toFixed(1)}px)`;
        if (follow) follow.style.transform = `translateY(${(-p * 10).toFixed(1)}px)`;
      });
    };

    const start = () => {
      if (!phone.matches || still.matches) {
        clear();
        window.removeEventListener("scroll", onScroll);
        return;
      }
      window.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
    };

    start();
    phone.addEventListener("change", start);
    still.addEventListener("change", start);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      phone.removeEventListener("change", start);
      still.removeEventListener("change", start);
      clear();
    };
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
