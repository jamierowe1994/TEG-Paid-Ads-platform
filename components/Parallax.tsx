"use client";

import { useEffect, useRef } from "react";

// Subtle parallax: as the page scrolls, the wrapped content drifts down a
// little (slower than the scroll), so the hero gently shifts rather than
// moving 1:1. Very understated. Disabled for reduced-motion.

export default function Parallax({
  speed = 0.32,
  max = 300,
  className = "",
  children,
}: {
  speed?: number;
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
      const shift = Math.min(window.scrollY * speed, max);
      el.style.transform = `translate3d(0, ${shift}px, 0)`;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [speed, max]);

  return (
    <div ref={ref} className={className} style={{ willChange: "transform" }}>
      {children}
    </div>
  );
}
