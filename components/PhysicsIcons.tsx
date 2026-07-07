"use client";

import { useEffect, useRef } from "react";
import ICONS, { SocialIcon } from "./SocialIcons";

// The hero's platform icons falling into the red panel with physics:
// gravity, bouncing off the floor, the walls, each other AND the brand-name
// pills (elements marked data-icon-obstacle), tumbling until they settle.
// The falling icons are the icons themselves — same size, same black as the
// hero strip, no chips — so the drop reads as the exact same icons
// continuing down from the section above. One-time animation.

const FALLBACK_SIZE = 56;
const GRAVITY = 2400; // px/s²
const FLOOR_PAD = 20;
const WALL_PAD = 10;
const OBSTACLE_REST = 0.5; // bounciness off brand pills

interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  a: number;
  va: number;
  asleep: boolean;
}

interface Rect {
  l: number;
  t: number;
  r: number;
  b: number;
}

export default function PhysicsIcons() {
  const containerRef = useRef<HTMLDivElement>(null);
  const iconRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const rafId = useRef(0);
  const running = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const reduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)"
    )?.matches;

    let bodies: Body[] = [];
    let obstacles: Rect[] = [];
    let size = FALLBACK_SIZE;
    let last = 0;

    const paint = () => {
      bodies.forEach((b, i) => {
        const el = iconRefs.current[i];
        if (el) {
          el.style.transform = `translate(${b.x}px, ${b.y}px) rotate(${b.a}deg)`;
        }
      });
    };

    const show = (visible: boolean) => {
      iconRefs.current.forEach((el) => {
        if (el) {
          el.style.opacity = visible ? "1" : "0";
          el.style.width = `${size}px`;
          el.style.height = `${size}px`;
        }
      });
    };

    // Icons leave the hero black, then bloom into their platform colours as
    // they drop into the panel.
    const colourise = () => {
      iconRefs.current.forEach((el, i) => {
        if (el) el.style.color = ICONS[i].color;
      });
    };

    // Brand pills (and anything else tagged) become solid objects, measured
    // in panel coordinates. The panel is the container's parent.
    const measureObstacles = () => {
      const contRect = container.getBoundingClientRect();
      const panel = container.parentElement ?? container;
      obstacles = [...panel.querySelectorAll("[data-icon-obstacle]")].map(
        (el) => {
          const r = el.getBoundingClientRect();
          return {
            l: r.left - contRect.left,
            t: r.top - contRect.top,
            r: r.right - contRect.left,
            b: r.bottom - contRect.top,
          };
        }
      );
    };

    // Spawn each icon exactly where it sits in the hero strip — same spot,
    // same size, so the fall is seamless.
    const init = () => {
      const contRect = container.getBoundingClientRect();
      const w = container.clientWidth;
      const firstHero = document.querySelector("[data-hero-icon]");
      if (firstHero) {
        size = Math.round(firstHero.getBoundingClientRect().width) || size;
      }
      const usable = w - size - WALL_PAD * 2;
      measureObstacles();
      bodies = ICONS.map((icon, i) => {
        const heroIcon = document.querySelector(
          `[data-hero-icon="${icon.name}"]`
        );
        let x: number;
        let y: number;
        if (heroIcon) {
          const r = heroIcon.getBoundingClientRect();
          x = r.left - contRect.left;
          y = r.top - contRect.top;
        } else {
          x = WALL_PAD + (usable * i) / Math.max(ICONS.length - 1, 1);
          y = -size - i * 90;
        }
        return {
          x: Math.min(Math.max(x, WALL_PAD), w - size - WALL_PAD),
          y,
          vx: Math.random() * 40 - 20,
          vy: 0,
          a: 0,
          va: Math.random() * 160 - 80,
          asleep: false,
        };
      });
      show(true);
      paint();
    };

    const restLayout = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      const usable = w - size - WALL_PAD * 2;
      bodies = ICONS.map((_, i) => ({
        x: WALL_PAD + (usable * i) / Math.max(ICONS.length - 1, 1),
        y: h - size - FLOOR_PAD,
        vx: 0,
        vy: 0,
        a: 0,
        va: 0,
        asleep: true,
      }));
      show(true);
      colourise();
      paint();
    };

    // Settle-or-bounce shared by the floor and the tops of obstacles.
    const land = (b: Body, impactSpeed: number) => {
      if (impactSpeed > 130) {
        b.vy = -impactSpeed * 0.55;
        b.vx += Math.random() * 70 - 35;
        b.va = -b.va * 0.6 + (Math.random() * 100 - 50);
      } else {
        b.vy = 0;
        b.vx *= 0.9;
        b.va *= 0.86;
        if (Math.abs(b.vx) < 8 && Math.abs(b.va) < 12) {
          b.vx = 0;
          b.va = 0;
          b.asleep = true;
        }
      }
    };

    const step = (t: number) => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      const floor = h - size - FLOOR_PAD;
      const R = size / 2;
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
        } else if (b.x > w - size - WALL_PAD) {
          b.x = w - size - WALL_PAD;
          b.vx = -Math.abs(b.vx) * 0.7;
        }

        // Brand pills — solid: bounce off, or come to rest on top
        const cx = b.x + R;
        const cy = b.y + R;
        for (const o of obstacles) {
          const nx = Math.min(Math.max(cx, o.l), o.r);
          const ny = Math.min(Math.max(cy, o.t), o.b);
          const dx = cx - nx;
          const dy = cy - ny;
          const d2 = dx * dx + dy * dy;
          if (d2 < R * R) {
            const d = Math.sqrt(d2) || 1;
            const ux = d2 === 0 ? 0 : dx / d;
            const uy = d2 === 0 ? -1 : dy / d;
            const push = R - (d2 === 0 ? 0 : d);
            b.x += ux * push;
            b.y += uy * push;
            const vn = b.vx * ux + b.vy * uy;
            if (vn < 0) {
              if (uy < -0.7) {
                // Hit the top of a pill — can settle there like a ledge
                land(b, Math.abs(b.vy));
              } else {
                b.vx -= (1 + OBSTACLE_REST) * vn * ux;
                b.vy -= (1 + OBSTACLE_REST) * vn * uy;
                b.va += Math.random() * 120 - 60;
              }
            }
          }
        }

        // Floor
        if (b.y >= floor) {
          b.y = floor;
          land(b, Math.abs(b.vy));
        }
      }

      // Icon-on-icon collisions (equal-mass circles)
      for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
          const a = bodies[i];
          const c = bodies[j];
          const dx = c.x - a.x;
          const dy = c.y - a.y;
          const d = Math.hypot(dx, dy);
          if (d > 0 && d < size) {
            const nx = dx / d;
            const ny = dy / d;
            const push = (size - d) / 2;
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
      // Kick off the black → colour transition a beat into the fall.
      setTimeout(colourise, 250);
      last = performance.now();
      rafId.current = requestAnimationFrame(step);
    };

    // Environments without frames/observer just show the resting layout.
    if (
      typeof IntersectionObserver === "undefined" ||
      window.innerHeight === 0
    ) {
      restLayout();
      return;
    }

    // One-time: fire on first sight, then stop observing.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            window.dispatchEvent(new Event("teg-icons-fall"));
            start();
            observer.disconnect();
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
        <span
          key={icon.name}
          ref={(el) => {
            iconRefs.current[i] = el;
          }}
          style={{
            opacity: 0,
            willChange: "transform",
            width: FALLBACK_SIZE,
            height: FALLBACK_SIZE,
            color: "#111827",
            transition: "color 0.8s ease",
          }}
          className="absolute left-0 top-0"
        >
          <SocialIcon icon={icon} className="h-full w-full" />
        </span>
      ))}
    </div>
  );
}
