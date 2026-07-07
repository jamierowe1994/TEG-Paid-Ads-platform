"use client";

import { useEffect, useRef, useState } from "react";
import ICONS, { SocialIcon } from "./SocialIcons";

// The social icons "fall" from above and bounce as this row scrolls into
// view — the hero's icon strip appearing to land at the bottom of the next
// screen. Pure CSS keyframes (see .fall-icon in globals.css), staggered per
// icon, triggered once by an IntersectionObserver.

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
            observer.disconnect();
          }
        }
      },
      { threshold: 0.4 }
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
          <SocialIcon icon={icon} className="h-8 w-8 sm:h-10 sm:w-10" />
        </span>
      ))}
    </div>
  );
}
