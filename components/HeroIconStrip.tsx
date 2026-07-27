"use client";

import ICONS, { SocialIcon } from "./SocialIcons";

// The platform icons along the foot of the hero. Plain white on the black hero;
// hovering one springs it up and bleeds its brand colour in. They used to drop
// off the page when the red panel scrolled in (the "teg-icons-fall" event) —
// that's gone, they simply sit at the bottom of the hero now.

export default function HeroIconStrip() {
  return (
    <div className="flex items-center justify-between text-white">
      {ICONS.map((icon) => (
        // Outer hit area is wider than the icon and stays put, so lifting the
        // inner icon never pulls it out from under the cursor (no flicker).
        <span
          key={icon.name}
          className="hero-icon-hit"
          // The dark-surface colour, since the hero is now black.
          style={{ "--icon-color": icon.color } as React.CSSProperties}
        >
          <span data-hero-icon={icon.name} className="hero-pop-icon inline-flex">
            <SocialIcon icon={icon} className="h-8 w-8 sm:h-11 sm:w-11" />
          </span>
        </span>
      ))}
    </div>
  );
}
