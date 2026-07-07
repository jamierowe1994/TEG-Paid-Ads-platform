"use client";

import { useEffect, useState } from "react";
import ICONS, { SocialIcon } from "./SocialIcons";

// The platform icons along the bottom of the hero. Hovering an icon makes it
// squeeze up and pop out — springing up taller and bigger while its colour
// bleeds in, settling back on leave. When the red panel scrolls into view,
// PhysicsIcons fires "teg-icons-fall" and this strip fades out. One-time:
// once fallen, they stay fallen.

export default function HeroIconStrip() {
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const fall = () => setGone(true);
    window.addEventListener("teg-icons-fall", fall);
    return () => window.removeEventListener("teg-icons-fall", fall);
  }, []);

  return (
    <div
      className={`flex items-end justify-between text-gray-900 transition-all duration-500 ${
        gone ? "translate-y-10 opacity-0" : "translate-y-0 opacity-100"
      }`}
    >
      {ICONS.map((icon) => (
        <span
          key={icon.name}
          data-hero-icon={icon.name}
          className="hero-pop-icon inline-flex cursor-pointer"
          style={
            {
              "--icon-color": icon.colorOnLight ?? icon.color,
            } as React.CSSProperties
          }
        >
          <SocialIcon icon={icon} className="h-8 w-8 sm:h-11 sm:w-11" />
        </span>
      ))}
    </div>
  );
}
