"use client";

import { useEffect, useRef } from "react";
import ICONS, { SocialIcon } from "./SocialIcons";

// Platform icons falling into the red panel with real-world-ish physics:
// gravity, bouncing off the floor/walls and each other, tumbling rotation,
// then settling naturally to rest. Each icon rides a white circular chip in
// its brand colour — the "black icons turn to colour as they hit the box".
//
// Tiny purpose-built simulation (rAF + refs, no per-frame React renders),
// coordinated with the hero strip via the teg-icons-fall/return events.

const SIZE = 60; // chip diameter, px
const GRAVITY = 2400; // px/s²
const FLOOR_PAD = 20;
const WALL_PAD = 10;

interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  a: number; // rotation, deg
  va: number; // angular velocity, deg/s
  asleep: boolean;
}

export default function PhysicsIcons() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chipRefs = useRef<(HTMLDivElement | null)[]>([]);
  const rafId = useRef(0);
  const running = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const reduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)"
    )?.matches;

    let bodies: Body[] = [];
    let last = 0;

    const paint = () => {
      bodies.forEach((b, i) => {
        const el = chipRefs.current[i];
        if (el) {
          el.style.transform = `translate(${b.x}px, ${b.y}px) rotate(${b.a}deg)`;
        }
      });
    };

    const show = (visible: boolean) => {
      chipRefs.current.forEach((el) => {
        if (el) el.style.opacity = visible ? "1" : "0";
      });
    };

    // Spawn above the panel, staggered, with a bit of sideways energy.
    const init = () => {
      const w = container.clientWidth;
      const usable = w - SIZE - WALL_PAD * 2;
      bodies = ICONS.map((_, i) => ({
        x:
          WALL_PAD +
          (usable * i) / Math.max(ICONS.length - 1, 1) +
          (Math.random() * 40 - 20),
        y: -SIZE - i * 90 - Math.random() * 160,
        vx: Math.random() * 200 - 100,
        vy: 0,
        a: Math.random() * 50 - 25,
        va: Math.random() * 300 - 150,
        asleep: false,
      }));
      show(true);
      paint();
    };

    // Instant resting layout (reduced motion / no-JS-frames fallback).
    const restLayout = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      const usable = w - SIZE - WALL_PAD * 2;
      bodies = ICONS.map((_, i) => ({
        x: WALL_PAD + (usable * i) / Math.max(ICONS.length - 1, 1),
        y: h - SIZE - FLOOR_PAD,
        vx: 0,
        vy: 0,
        a: 0,
        va: 0,
        asleep: true,
      }));
      show(true);
      paint();
    };

    const step = (t: number) => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      const floor = h - SIZE - FLOOR_PAD;
      const dt = Math.min((t - last) / 1000, 1 / 30);
      last = t;

      for (const b of bodies) {
        if (b.asleep) continue;
        b.vy += GRAVITY * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.a += b.va * dt;

        // Walls
        if (b.x < WALL_PAD) {
          b.x = WALL_PAD;
          b.vx = Math.abs(b.vx) * 0.7;
        } else if (b.x > w - SIZE - WALL_PAD) {
          b.x = w - SIZE - WALL_PAD;
          b.vx = -Math.abs(b.vx) * 0.7;
        }

        // Floor
        if (b.y >= floor) {
          b.y = floor;
          if (Math.abs(b.vy) > 130) {
            // Bounce with energy loss + a little chaotic tumble
            b.vy = -b.vy * 0.55;
            b.vx += Math.random() * 70 - 35;
            b.va = -b.va * 0.6 + (Math.random() * 100 - 50);
          } else {
            // Rolling to a stop
            b.vy = 0;
            b.vx *= 0.9;
            b.va *= 0.86;
            if (Math.abs(b.vx) < 8 && Math.abs(b.va) < 12) {
              b.vx = 0;
              b.va = 0;
              b.asleep = true;
            }
          }
        }
      }

      // Chip-on-chip collisions (equal-mass circles)
      for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
          const a = bodies[i];
          const c = bodies[j];
          const dx = c.x - a.x;
          const dy = c.y - a.y;
          const d = Math.hypot(dx, dy);
          if (d > 0 && d < SIZE) {
            const nx = dx / d;
            const ny = dy / d;
            const push = (SIZE - d) / 2;
            a.x -= nx * push;
            a.y -= ny * push;
            c.x += nx * push;
            c.y += ny * push;
            const rel = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
            if (rel < 0) {
              const impulse = rel * 0.75;
              a.vx += nx * impulse;
              a.vy += ny * impulse;
              c.vx -= nx * impulse;
              c.vy -= ny * impulse;
              a.asleep = false;
              c.asleep = false;
            }
          }
        }
      }

      paint();
      if (bodies.some((b) => !b.asleep) && running.current) {
        rafId.current = requestAnimationFrame(step);
      } else {
        running.current = false;
      }
    };

    const start = () => {
      if (running.current) return;
      if (reduced) {
        restLayout();
        return;
      }
      running.current = true;
      init();
      last = performance.now();
      rafId.current = requestAnimationFrame(step);
    };

    const reset = () => {
      running.current = false;
      cancelAnimationFrame(rafId.current);
      show(false);
    };

    // Environments without frames/observer just show the resting layout.
    if (
      typeof IntersectionObserver === "undefined" ||
      window.innerHeight === 0
    ) {
      restLayout();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            window.dispatchEvent(new Event("teg-icons-fall"));
            start();
          } else if (entry.boundingClientRect.top > 0) {
            // Scrolled back above the panel — return icons to the hero and
            // arm the drop to replay.
            window.dispatchEvent(new Event("teg-icons-return"));
            reset();
          }
        }
      },
      { threshold: 0.25 }
    );
    observer.observe(container);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(rafId.current);
      running.current = false;
    };
  }, []);

  return (
    <div
      ref={containerRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {ICONS.map((icon, i) => (
        <div
          key={icon.name}
          ref={(el) => {
            chipRefs.current[i] = el;
          }}
          style={{ opacity: 0, willChange: "transform", width: SIZE, height: SIZE }}
          className="absolute left-0 top-0 flex items-center justify-center rounded-full bg-white shadow-lg"
        >
          <span style={{ color: icon.color }}>
            <SocialIcon icon={icon} className="h-7 w-7" />
          </span>
        </div>
      ))}
    </div>
  );
}
