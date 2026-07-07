"use client";

import { useEffect, useState } from "react";
import ICONS, { SocialIcon } from "./SocialIcons";

// The platform icons sitting along the bottom of the hero. When the second
// screen scrolls into view, FallingIcons fires "teg-icons-fall" — this strip
// fades away so the icons read as having fallen out of the hero into the
// next section. Scrolling back up fires "teg-icons-return" and they're back.

export default function HeroIconStrip() {
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const fall = () => setGone(true);
    const back = () => setGone(false);
    window.addEventListener("teg-icons-fall", fall);
    window.addEventListener("teg-icons-return", back);
    return () => {
      window.removeEventListener("teg-icons-fall", fall);
      window.removeEventListener("teg-icons-return", back);
    };
  }, []);

  return (
    <div
      className={`flex items-center justify-between text-gray-900 transition-all duration-500 ${
        gone ? "translate-y-10 opacity-0" : "translate-y-0 opacity-100"
      }`}
    >
      {ICONS.map((icon) => (
        <SocialIcon
          key={icon.name}
          icon={icon}
          className="h-10 w-10 sm:h-14 sm:w-14"
        />
      ))}
    </div>
  );
}
