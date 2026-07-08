"use client";

import { useEffect } from "react";

// Reveals the red contour layer (#contour-tint-layer, rendered by
// <BackgroundTexture tint />) only within the target panel's on-screen
// rectangle. Both the grey base texture and the red copy are fixed, full-
// screen and share the same viewBox, so they line up pixel-for-pixel — a
// clip-path inset matching the panel's bounding rect (with rounded corners
// to match the box) exposes the red lines exactly where the frosted panel
// sits. Result: dots under the box read red, dots outside stay grey, and a
// line straddling the edge is red inside / grey outside.

const RADIUS = 40; // matches the panel's rounded-[2.5rem]

export default function ContourClip({ targetId }: { targetId: string }) {
  useEffect(() => {
    // Update synchronously on scroll (one getBoundingClientRect + a style
    // write — cheap) rather than via rAF, which throttles in background/
    // occluded tabs. Matches <Parallax>/<PanelReveal>.
    const update = () => {
      const layer = document.getElementById("contour-tint-layer");
      const section = document.getElementById(targetId);
      // Clip to the frosted panel itself, not the section — the panel is
      // transform-shifted by <Parallax>, so its on-screen rect is what the
      // red layer must line up with.
      const el = section?.querySelector<HTMLElement>(".glass-panel") ?? section;
      if (!layer || !el) return;
      const r = el.getBoundingClientRect();
      const winW = window.innerWidth || 1200;
      const winH = window.innerHeight || 800;
      // inset(top right bottom left) — insets from each viewport edge so the
      // only visible band is the panel's rect. Clamp to >= 0.
      const top = Math.max(0, r.top);
      const left = Math.max(0, r.left);
      const right = Math.max(0, winW - r.right);
      const bottom = Math.max(0, winH - r.bottom);
      layer.style.clipPath = `inset(${top}px ${right}px ${bottom}px ${left}px round ${RADIUS}px)`;
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      const layer = document.getElementById("contour-tint-layer");
      if (layer) layer.style.clipPath = "inset(100%)";
    };
  }, [targetId]);

  return null;
}
