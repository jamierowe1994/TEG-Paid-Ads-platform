"use client";

import { useEffect, useRef } from "react";

// Scroll-reveal wrapper: children slide/fade in the first time they enter
// the viewport. Direction and a stagger delay are configurable. Motion is
// disabled automatically for prefers-reduced-motion (see globals.css).

export default function Reveal({
  children,
  direction = "up",
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  direction?: "up" | "left" | "right";
  delay?: number; // ms
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Fallback: no IntersectionObserver (or a zero-sized viewport) must never
    // leave content invisible.
    if (
      typeof IntersectionObserver === "undefined" ||
      window.innerHeight === 0
    ) {
      el.classList.add("revealed");
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            el.classList.add("revealed");
            observer.disconnect();
          }
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const dirClass =
    direction === "left"
      ? "reveal reveal-left"
      : direction === "right"
        ? "reveal reveal-right"
        : "reveal";

  return (
    <div
      ref={ref}
      className={`${dirClass} ${className}`}
      style={{ "--reveal-delay": `${delay}ms` } as React.CSSProperties}
    >
      {children}
    </div>
  );
}
