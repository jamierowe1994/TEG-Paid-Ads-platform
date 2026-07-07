"use client";

import { useEffect, useRef, useState } from "react";

// Wraps the "Paid ads that stop the scroll" panel and adds the `revealed`
// class once it scrolls into view, so the staged CSS animations (words fade,
// image expand, stat expand, pills float up) fire in sequence.
//
// Uses a scroll-position check (getBoundingClientRect) rather than only an
// IntersectionObserver, so the reveal is guaranteed to fire — this content
// starts hidden, so it must never get stuck invisible.

export default function PanelReveal({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let done = false;

    const check = () => {
      if (done) return;
      const vh = window.innerHeight || 800;
      const r = el.getBoundingClientRect();
      // Reveal once the panel's top third is on screen.
      if (r.top < vh * 0.75 && r.bottom > 0) {
        done = true;
        setRevealed(true);
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", onScroll);
      }
    };
    // Direct check on each scroll (one getBoundingClientRect — cheap, and
    // reliable everywhere, unlike rAF which throttles in background tabs).
    const onScroll = () => check();

    check(); // in case it's already in view on load
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    // Safety net: never leave the content hidden.
    const failSafe = setTimeout(() => setRevealed(true), 6000);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      clearTimeout(failSafe);
    };
  }, []);

  return (
    <div ref={ref} className={`${className} ${revealed ? "revealed" : ""}`}>
      {children}
    </div>
  );
}
