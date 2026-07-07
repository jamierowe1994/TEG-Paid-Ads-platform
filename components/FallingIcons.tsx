"use client";

import { useEffect, useRef, useState } from "react";
import ICONS, { SocialIcon } from "./SocialIcons";

// The landing spot for the hero's platform icons. When this row scrolls
// into view the icons fall from above and bounce as they land (CSS
// keyframes, staggered) — and we tell the hero strip to hide, so one set of
// icons reads as travelling from the hero to the bottom of this screen.
// Scrolling back above resets both, so the effect replays.

export default function FallingIcons() {
  const ref = useRef<HTMLDivElement>(null);
  const [dropped, setDropped] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (
      typeof IntersectionObserver === "undefined" ||
      window.innerHeight === 0
    ) {
      setDropped(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setDropped(true);
            window.dispatchEvent(new Event("teg-icons-fall"));
          } else if (entry.boundingClientRect.top > 0) {
            // Row left the viewport downwards → user scrolled back to the
            // hero. Reset so the icons return and the fall can replay.
            setDropped(false);
            window.dispatchEvent(new Event("teg-icons-return"));
          }
        }
      },
      { threshold: 0.35 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="flex w-full items-end justify-between text-gray-900"
    >
      {ICONS.map((icon, i) => (
        <span
          key={icon.name}
          className={`fall-icon ${dropped ? "dropped" : ""}`}
          style={{ animationDelay: `${i * 110}ms` }}
        >
          <SocialIcon icon={icon} className="h-10 w-10 sm:h-14 sm:w-14" />
        </span>
      ))}
    </div>
  );
}
