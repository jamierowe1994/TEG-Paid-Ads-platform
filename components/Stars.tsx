"use client";

import { useEffect, useState } from "react";

// The night sky behind the landing page: a fixed field of stars, edge to edge,
// with a handful of tight clusters so it never reads as a uniform grid. Every
// ~50s a small shooting star crosses. Positions are generated on the client so
// there's no server/client mismatch to hydrate around.

type Star = { x: number; y: number; r: number; o: number; delay: number };
type Shot = { id: number; x: number; y: number; len: number; rot: number };

export default function Stars() {
  const [stars, setStars] = useState<Star[]>([]);
  const [shot, setShot] = useState<Shot | null>(null);

  useEffect(() => {
    const out: Star[] = [];
    const star = (x: number, y: number, maxR: number) => ({
      x,
      y,
      r: Math.random() * maxR + 0.4,
      o: Math.random() * 0.45 + 0.18,
      delay: Math.random() * 7,
    });
    // Even scatter right out to the edges.
    for (let i = 0; i < 150; i++) {
      out.push(star(Math.random() * 100, Math.random() * 100, 1.3));
    }
    // Clusters — a few dense knots, like real sky.
    for (let c = 0; c < 8; c++) {
      const cx = Math.random() * 100;
      const cy = Math.random() * 100;
      for (let i = 0; i < 11; i++) {
        out.push(
          star(
            Math.min(100, Math.max(0, cx + (Math.random() - 0.5) * 10)),
            Math.min(100, Math.max(0, cy + (Math.random() - 0.5) * 10)),
            1,
          ),
        );
      }
    }
    setStars(out);
  }, []);

  // A shooting star shortly after load, then roughly once a minute.
  useEffect(() => {
    let n = 0;
    const fire = () => {
      n += 1;
      setShot({
        id: n,
        x: Math.random() * 55,
        y: Math.random() * 45,
        len: 90 + Math.random() * 70,
        rot: 12 + Math.random() * 22,
      });
    };
    const first = window.setTimeout(fire, 6000);
    const every = window.setInterval(fire, 52000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(every);
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {stars.map((s, i) => (
        <span
          key={i}
          className="star"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: `${s.r}px`,
            height: `${s.r}px`,
            opacity: s.o,
            animationDelay: `${s.delay}s`,
          }}
        />
      ))}
      {shot && (
        <span
          key={shot.id}
          className="shooting-star"
          style={{
            left: `${shot.x}%`,
            top: `${shot.y}%`,
            width: `${shot.len}px`,
            transform: `rotate(${shot.rot}deg)`,
          }}
        />
      )}
    </div>
  );
}
