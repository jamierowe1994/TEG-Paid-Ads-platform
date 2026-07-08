"use client";

import { useId } from "react";

// Small colour brand icons for where a lead came from — shown next to the
// lead's name instead of a text badge.
export default function SourceIcon({
  source,
  size = 18,
  className = "",
}: {
  source: "instagram" | "facebook" | "referral";
  size?: number;
  className?: string;
}) {
  const gid = useId();
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    className,
    "aria-hidden": true,
  } as const;

  if (source === "facebook") {
    return (
      <svg {...common}>
        <title>Facebook</title>
        <path
          fill="#1877F2"
          d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.5c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z"
        />
      </svg>
    );
  }
  if (source === "instagram") {
    return (
      <svg {...common}>
        <title>Instagram</title>
        <defs>
          <radialGradient id={gid} cx="30%" cy="107%" r="140%">
            <stop offset="0%" stopColor="#fdf497" />
            <stop offset="8%" stopColor="#fdf497" />
            <stop offset="45%" stopColor="#fd5949" />
            <stop offset="60%" stopColor="#d6249f" />
            <stop offset="90%" stopColor="#285AEB" />
          </radialGradient>
        </defs>
        <rect x="1.5" y="1.5" width="21" height="21" rx="6" fill={`url(#${gid})`} />
        <circle cx="12" cy="12" r="4.4" fill="none" stroke="#fff" strokeWidth="1.7" />
        <circle cx="17.3" cy="6.7" r="1.25" fill="#fff" />
      </svg>
    );
  }
  // referral
  return (
    <svg {...common}>
      <title>Referral</title>
      <circle cx="12" cy="12" r="12" fill="#F59E0B" />
      <path
        fill="none"
        stroke="#fff"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 9h6.5m0 0-2-2m2 2-2 2M16 15H9.5m0 0 2-2m-2 2 2 2"
      />
    </svg>
  );
}
