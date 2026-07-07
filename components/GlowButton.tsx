"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";

// The hero's dark glass pill — the centrepiece of the page. Starfields
// drift continuously inside, a soft light tracks the cursor from ANYWHERE
// on the page (window-level mousemove + scroll, not just hover), and a very
// subtle chromatic rim rotates slowly around the edge for a 3D, lit-glass
// feel. Styling lives in globals.css under .btn-glow*.

export default function GlowButton({
  href,
  children,
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 3;

    const update = () => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      // Position of the cursor relative to the button — deliberately
      // unclamped-ish so the light leans toward the cursor even when it's
      // far away, like a reflection tracking a torch across the room.
      const mx = ((mouseX - r.left) / r.width) * 100;
      const my = ((mouseY - r.top) / r.height) * 100;
      el.style.setProperty("--mx", `${Math.max(-80, Math.min(180, mx))}%`);
      el.style.setProperty("--my", `${Math.max(-150, Math.min(250, my))}%`);
    };

    const onMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      update();
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("scroll", update, { passive: true });
    update();
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("scroll", update);
    };
  }, []);

  return (
    <Link ref={ref} href={href} className={`btn-glow ${className}`}>
      <span className="btn-glow-rim" aria-hidden />
      <span className="btn-glow-stars" aria-hidden />
      <span className="btn-glow-stars2" aria-hidden />
      <span className="btn-glow-stars3" aria-hidden />
      <span className="btn-glow-cursor" aria-hidden />
      <span className="relative">{children}</span>
    </Link>
  );
}
