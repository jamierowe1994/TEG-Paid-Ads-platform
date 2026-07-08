"use client";

import { useEffect, useRef } from "react";

// A tiny self-contained confetti burst (no dependencies). Fires once when
// `fire` flips true — used when a customer's ads go live. Subtle: a single
// pop from the middle that settles in under two seconds.
export default function Confetti({ fire }: { fire: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!fire) return;
    const canvas = ref.current;
    if (!canvas) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const colors = ["#E31F36", "#2B6193", "#A3C739", "#A78F51", "#41AAE1", "#F59E0B"];
    const parts = Array.from({ length: 90 }, () => ({
      x: rect.width / 2,
      y: rect.height * 0.55,
      vx: (Math.random() - 0.5) * 9,
      vy: -(Math.random() * 9 + 4),
      g: 0.22 + Math.random() * 0.12,
      size: 4 + Math.random() * 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      rot: Math.random() * 6,
      vr: (Math.random() - 0.5) * 0.35,
    }));

    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const el = t - t0;
      ctx.clearRect(0, 0, rect.width, rect.height);
      const life = Math.max(0, 1 - el / 1800);
      for (const p of parts) {
        p.vy += p.g;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.globalAlpha = life;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }
      if (el < 1900) raf = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, rect.width, rect.height);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [fire]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-0 z-10 h-full w-full"
    />
  );
}
