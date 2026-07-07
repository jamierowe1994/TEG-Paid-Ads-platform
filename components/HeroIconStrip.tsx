"use client";

import { useEffect, useState } from "react";
import ICONS, { SocialIcon } from "./SocialIcons";

// The platform icons sitting along the bottom of the hero. When the red
// panel scrolls into view, PhysicsIcons fires "teg-icons-fall" — this strip
// fades away as the chips drop into the panel from these exact positions
// (each icon is tagged with data-hero-icon so the physics can measure it).
// One-time: once they've fallen, they stay fallen.

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
      {ICONS.map((icon) => (
        <span key={icon.name} data-hero-icon={icon.name}>
          <SocialIcon icon={icon} className="h-10 w-10 sm:h-14 sm:w-14" />
        </span>
      ))}
    </div>
  );
}
