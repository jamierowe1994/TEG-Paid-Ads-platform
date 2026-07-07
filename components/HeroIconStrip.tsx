"use client";

import { useEffect, useState } from "react";
import ICONS, { SocialIcon } from "./SocialIcons";

// The platform icons along the bottom of the hero. On page load they play a
// slow left-to-right wave: each icon pops up and bleeds from black into its
// brand colour, then settles back to black as the next one rises — like a
// black-and-white photo turning to colour, ending on TikTok. When the red
// panel scrolls into view, PhysicsIcons fires "teg-icons-fall" and this strip
// fades out. One-time: once fallen, they stay fallen.

const STAGGER = 0.8; // s between each icon starting to rise
const DURATION = 1.6; // s per pop

export default function HeroIconStrip() {
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const fall = () => setGone(true);
    window.addEventListener("teg-icons-fall", fall);
    return () => window.removeEventListener("teg-icons-fall", fall);
  }, []);

  return (
    <div
      className={`flex items-center justify-between text-gray-900 transition-all duration-500 ${
        gone ? "translate-y-10 opacity-0" : "translate-y-0 opacity-100"
      }`}
    >
      {ICONS.map((icon, i) => (
        <span
          key={icon.name}
          data-hero-icon={icon.name}
          className="hero-pop-icon inline-flex"
          style={
            {
              "--icon-color": icon.colorOnLight ?? icon.color,
              animationDelay: `${i * STAGGER}s`,
              animationDuration: `${DURATION}s`,
            } as React.CSSProperties
          }
        >
          <SocialIcon icon={icon} className="h-8 w-8 sm:h-11 sm:w-11" />
        </span>
      ))}
    </div>
  );
}
