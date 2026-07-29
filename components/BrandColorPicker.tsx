"use client";

import { useEffect, useState } from "react";

// A try-before-you-buy brand colour switcher for the landing page. The group
// is weighing up a rebrand away from the maroon, so this floats a little
// palette button in the bottom-right corner; picking a swatch repaints
// everything that runs off the --group variables live, so they can see each
// candidate colour in situ. Choices persist in localStorage so the page can
// be reloaded/shared around the office without losing the selection.
//
// Every brand-coloured element derives from three variables (set in
// globals.css and overridden inline here):
//   --group         the colour itself
//   --group-bright  lighter/brighter — gradient tops, highlights
//   --group-deep    darker — gradient bottoms, pressed shadows

// Each family is a trio: lighter/brighter, the colour, and slightly darker —
// any of the three can be picked as the brand colour.
const FAMILIES: { name: string; shades: [string, string, string] }[] = [
  { name: "Maroon", shades: ["#c13440", "#a72a35", "#7f1f28"] },
  { name: "Red", shades: ["#ef4444", "#dc2626", "#991b1b"] },
  { name: "Orange", shades: ["#fb923c", "#ea580c", "#9a3412"] },
  { name: "Amber", shades: ["#fbbf24", "#d97706", "#92400e"] },
  { name: "Yellow", shades: ["#facc15", "#eab308", "#a16207"] },
  { name: "Green", shades: ["#4ade80", "#16a34a", "#166534"] },
  { name: "Teal", shades: ["#2dd4bf", "#0d9488", "#115e59"] },
  { name: "Blue", shades: ["#60a5fa", "#2563eb", "#1e40af"] },
  { name: "Indigo", shades: ["#818cf8", "#4f46e5", "#3730a3"] },
  { name: "Purple", shades: ["#c084fc", "#9333ea", "#6b21a8"] },
  { name: "Pink", shades: ["#f472b6", "#db2777", "#9d174d"] },
  { name: "Slate", shades: ["#94a3b8", "#475569", "#1e293b"] },
];

const DEFAULT = "#a72a35";
const STORAGE_KEY = "teg-brand-colour";

// Lighten/darken a hex via HSL so the gradient endpoints track whatever
// swatch is picked instead of staying maroon.
function shift(hex: string, dl: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) / 255,
    g = ((n >> 8) & 255) / 255,
    b = (n & 255) / 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  let h = 0;
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const nl = Math.min(1, Math.max(0, l + dl));
  const c = (1 - Math.abs(2 * nl - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = nl - c / 2;
  let rr = 0,
    gg = 0,
    bb = 0;
  if (h < 60) [rr, gg, bb] = [c, x, 0];
  else if (h < 120) [rr, gg, bb] = [x, c, 0];
  else if (h < 180) [rr, gg, bb] = [0, c, x];
  else if (h < 240) [rr, gg, bb] = [0, x, c];
  else if (h < 300) [rr, gg, bb] = [x, 0, c];
  else [rr, gg, bb] = [c, 0, x];
  const to = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(rr)}${to(gg)}${to(bb)}`;
}

function apply(hex: string) {
  const root = document.documentElement.style;
  root.setProperty("--group", hex);
  root.setProperty("--group-bright", shift(hex, 0.08));
  root.setProperty("--group-deep", shift(hex, -0.13));
}

function clear() {
  const root = document.documentElement.style;
  root.removeProperty("--group");
  root.removeProperty("--group-bright");
  root.removeProperty("--group-deep");
}

export default function BrandColorPicker() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);

  // Re-apply a previously saved colour on load.
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      apply(saved);
      setCurrent(saved);
    }
  }, []);

  const pick = (hex: string) => {
    apply(hex);
    setCurrent(hex);
    localStorage.setItem(STORAGE_KEY, hex);
  };
  const reset = () => {
    clear();
    setCurrent(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
      {open && (
        <div className="w-64 rounded-2xl border border-gray-200 bg-white p-4 shadow-[0_24px_48px_-16px_rgba(17,24,39,0.35)]">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
              Brand colour
            </p>
            <button
              onClick={reset}
              className="text-xs font-medium text-gray-400 underline underline-offset-2 transition hover:text-gray-900"
            >
              Reset
            </button>
          </div>
          <div className="mt-3 space-y-2">
            {FAMILIES.map((f) => (
              <div key={f.name} className="flex items-center gap-2">
                <span className="w-14 shrink-0 text-[11px] text-gray-500">
                  {f.name}
                </span>
                <div className="flex flex-1 gap-1.5">
                  {f.shades.map((hex) => (
                    <button
                      key={hex}
                      onClick={() => pick(hex)}
                      aria-label={`${f.name} ${hex}`}
                      className={`h-7 flex-1 rounded-md transition hover:scale-110 ${
                        current === hex
                          ? "ring-2 ring-gray-900 ring-offset-2"
                          : "ring-1 ring-black/5"
                      }`}
                      style={{ backgroundColor: hex }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-gray-400">
            Repaints everything maroon on this page. Saved on this device
            until you reset.
          </p>
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Try a different brand colour"
        className="flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 shadow-[0_10px_24px_-8px_rgba(17,24,39,0.4)] transition hover:scale-105 hover:text-gray-900"
      >
        {/* Palette icon */}
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 21a9 9 0 1 1 9-9c0 2.5-2 3-3.5 3H15a2 2 0 0 0-1.5 3.3c.4.5.6.9.3 1.3-.4.3-1.1.4-1.8.4Z" />
          <circle cx="7.5" cy="11.5" r="1" fill="currentColor" stroke="none" />
          <circle cx="10.5" cy="7.5" r="1" fill="currentColor" stroke="none" />
          <circle cx="15" cy="7.5" r="1" fill="currentColor" stroke="none" />
          <circle cx="17.5" cy="11" r="1" fill="currentColor" stroke="none" />
        </svg>
      </button>
    </div>
  );
}
