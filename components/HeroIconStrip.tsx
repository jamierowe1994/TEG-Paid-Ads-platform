"use client";

import ICONS, { SocialIcon } from "./SocialIcons";

// The platform icons along the foot of the hero. Plain near-black on the
// light hero; hovering one springs it up and bleeds its brand colour in. They used to drop
// off the page when the red panel scrolled in (the "teg-icons-fall" event) —
// that's gone, they simply sit at the bottom of the hero now.

// Six hit areas don't fit across a phone (the row overflowed and got
// clipped), so the two quietest platforms sit out below the sm breakpoint.
const HIDDEN_ON_MOBILE = new Set(["Google", "TikTok"]);

export default function HeroIconStrip() {
  return (
    <div className="flex items-center justify-center max-sm:gap-1 sm:justify-between text-[#16171a]">
      {ICONS.map((icon, i) => (
        // Outer hit area is wider than the icon and stays put, so lifting the
        // inner icon never pulls it out from under the cursor (no flicker).
        // --i staggers the load-sequence flash, one icon after the next.
        <span
          key={icon.name}
          // The ! matters: .hero-icon-hit sets display in plain (unlayered)
          // CSS, which outranks Tailwind's layered `hidden` utility.
          className={`hero-icon-hit hero-icon-in${
            HIDDEN_ON_MOBILE.has(icon.name) ? " max-sm:hidden!" : ""
          }`}
          // The platform brand colour that bleeds in on hover.
          style={
            { "--icon-color": icon.color, "--i": i } as React.CSSProperties
          }
        >
          <span data-hero-icon={icon.name} className="hero-pop-icon inline-flex">
            <SocialIcon icon={icon} className="h-8 w-8 sm:h-11 sm:w-11" />
          </span>
        </span>
      ))}
    </div>
  );
}
