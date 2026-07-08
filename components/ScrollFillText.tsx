"use client";

import { useEffect, useRef } from "react";

// Word-by-word "fill" reveal: the quote starts faded grey and each word lights
// up to solid as the block scrolls up through the viewport — emphasising the
// stop-the-scroll line. Sets opacity directly on the spans (no re-renders).

export default function ScrollFillText({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  const ref = useRef<HTMLQuoteElement>(null);
  const words = text.split(" ");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const spans = Array.from(el.querySelectorAll<HTMLElement>("[data-w]"));
    const n = spans.length;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
      spans.forEach((s) => (s.style.opacity = "1"));
      return;
    }

    let raf = 0;
    const update = () => {
      raf = 0;
      const rect = el.getBoundingClientRect();
      const winH = window.innerHeight || 800;
      // Fill runs as the block travels from ~82% down the viewport to ~34%.
      const start = winH * 0.82;
      const end = winH * 0.34;
      const p = Math.max(0, Math.min(1, (start - rect.top) / (start - end)));
      for (let i = 0; i < n; i++) {
        const wp = Math.max(0, Math.min(1, p * (n + 3) - i));
        spans[i].style.opacity = String(0.16 + 0.84 * wp);
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
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <blockquote ref={ref} className={className}>
      {words.map((w, i) => (
        <span key={i} data-w style={{ opacity: 0.16 }}>
          {w}
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </blockquote>
  );
}
