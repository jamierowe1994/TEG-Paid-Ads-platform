"use client";

import { useRef } from "react";
import Link from "next/link";

// The hero CTA — an Ali Braid-style liquid-glass pill. Frosted refractive
// body with a crisp bevel, chromatic corners, a cursor-driven shine, a gentle
// tilt toward the pointer, and a chromatic edge that rotates on hover. Styling
// lives in globals.css under .btn-glass*.

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

  function onMove(e: React.PointerEvent<HTMLAnchorElement>) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    el.style.setProperty("--gx", `${px * 100}%`);
    el.style.setProperty("--gy", `${py * 100}%`);
    el.style.setProperty("--rx", `${(0.5 - py) * 8}deg`);
    el.style.setProperty("--ry", `${(px - 0.5) * 9}deg`);
    el.style.setProperty("--ty", "-2px");
    el.style.setProperty("--glow-o", "0.9");
  }

  function onLeave() {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--gx", "50%");
    el.style.setProperty("--gy", "12%");
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
    el.style.setProperty("--ty", "0px");
    el.style.setProperty("--glow-o", "0.2");
  }

  return (
    <Link
      ref={ref}
      href={href}
      className={`btn-glass ${className}`}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
    >
      <span className="btn-glass-corners" aria-hidden />
      <span className="btn-glass-shine" aria-hidden />
      <span className="btn-glass-rim" aria-hidden />
      <span className="relative z-[2]">{children}</span>
    </Link>
  );
}
