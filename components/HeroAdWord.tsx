"use client";

import { useState } from "react";

// The hidden nugget in the hero headline: the word "ad" looks like any other
// word, but hovering (or tapping/clicking, for touch) splits the line and a
// "New lead" card expands in between. Styling lives in globals.css
// (.ad-trigger / .ad-reveal).

export default function HeroAdWord() {
  const [open, setOpen] = useState(false);

  return (
    <span
      className={`ad-trigger ${open ? "ad-open" : ""}`}
      tabIndex={0}
      role="button"
      aria-label="ad — a lead arriving"
      onClick={() => setOpen((o) => !o)}
      onKeyDown={(e) => e.key === "Enter" && setOpen((o) => !o)}
    >
      {/* Expands between “Our” and “ad” */}
      <span
        className="ad-reveal"
        style={{ "--ad-card-w": "324px" } as React.CSSProperties}
      >
        <span className="mx-6 inline-block w-[276px] whitespace-normal rounded-2xl border border-[#f3f4f6] bg-[#ffffff] p-4 text-left align-middle font-normal normal-case tracking-normal shadow-xl">
          <span className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[#9ca3af]">
              New lead
            </span>
            <span className="flex items-center gap-1 text-[10px] font-medium text-green-600">
              <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-green-500" />
              Just now
            </span>
          </span>
          <span className="mt-2.5 flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f3f4f6] text-xs font-semibold text-[#4b5563]">
              SM
            </span>
            <span className="leading-tight">
              <span className="block text-xs font-semibold text-[#111827]">
                Sarah Mitchell
              </span>
              <span className="block text-[10px] text-[#9ca3af]">
                via Facebook ad
              </span>
            </span>
          </span>
        </span>
      </span>
      ad
    </span>
  );
}
