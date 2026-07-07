"use client";

import { useState } from "react";

// Shows a brand's uploaded logo (from /public/brand-logos) if it loads,
// otherwise falls back to a coloured square with the brand's initial. This
// means logos "just appear" once the client drops the files in — no code
// change required.

export default function BrandMark({
  name,
  accent,
  logo,
  size = 32,
  rounded = "rounded-lg",
}: {
  name: string;
  accent: string;
  logo?: string | null;
  size?: number;
  rounded?: string;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = logo && !failed;

  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden ${rounded}`}
      style={{
        width: size,
        height: size,
        backgroundColor: showImage ? "transparent" : accent,
      }}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logo}
          alt={name}
          className="h-full w-full object-contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <span
          className="font-bold text-white"
          style={{ fontSize: size * 0.44 }}
        >
          {name.replace(/^The\s+/, "").charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  );
}
