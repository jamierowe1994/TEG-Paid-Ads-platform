"use client";
import { useEffect, useState } from "react";

// Smoothly collapses its children in on themselves when `open` goes false —
// the box shrinks its own height to zero and fades, so everything below slides
// up to fill the gap instead of jumping. The house style: nothing just
// vanishes, it folds away in front of you.
//
// Uses the grid-rows 1fr→0fr trick so it animates to the content's real height
// without us having to measure it. Put any spacing (mt-*) on the child INSIDE
// so it collapses too. onCollapsed fires once the close finishes — the parent
// can then unmount, persist state, or navigate.
export default function Collapse({
  open,
  onCollapsed,
  children,
}: {
  open: boolean;
  onCollapsed?: () => void;
  children: React.ReactNode;
}) {
  // Skip animating the very first paint — only transition real changes, so a
  // box that starts open doesn't play an expand on load.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div
      className={`grid ${
        ready ? "transition-[grid-template-rows,opacity] duration-300 ease-out" : ""
      } ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
      onTransitionEnd={(e) => {
        // Opacity finishing is the reliable signal the close has landed.
        if (!open && e.propertyName === "opacity") onCollapsed?.();
      }}
    >
      <div className="overflow-hidden">{children}</div>
    </div>
  );
}
