"use client";

import { useId } from "react";

// Small colour brand icons for where a lead came from — shown next to the
// lead's name instead of a text badge.
export default function SourceIcon({
  source,
  size = 18,
  className = "",
}: {
  source:
    | "instagram"
    | "facebook"
    | "referral"
    | "self"
    | "google"
    | "website"
    | "canvassing"
    | "other";
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
  if (source === "referral") {
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
  if (source === "google") {
    return (
      <svg {...common}>
        <title>Google</title>
        <circle cx="12" cy="12" r="12" fill="#fff" stroke="#e5e7eb" strokeWidth="1" />
        <path fill="#4285F4" d="M18.6 12.15c0-.47-.04-.92-.12-1.35H12v2.56h3.7a3.17 3.17 0 0 1-1.37 2.08v1.73h2.22c1.3-1.2 2.05-2.96 2.05-5.02z" />
        <path fill="#34A853" d="M12 18.5c1.85 0 3.41-.61 4.55-1.66l-2.22-1.73c-.62.42-1.4.66-2.33.66-1.8 0-3.31-1.21-3.85-2.84H5.86v1.78A6.86 6.86 0 0 0 12 18.5z" />
        <path fill="#FBBC05" d="M8.15 12.93a4.12 4.12 0 0 1 0-2.63V8.52H5.86a6.87 6.87 0 0 0 0 6.19l2.29-1.78z" />
        <path fill="#EA4335" d="M12 7.46c1 0 1.9.35 2.62 1.03l1.96-1.96A6.86 6.86 0 0 0 5.86 8.52l2.29 1.78C8.69 8.67 10.2 7.46 12 7.46z" />
      </svg>
    );
  }
  if (source === "website") {
    return (
      <svg {...common}>
        <title>Website</title>
        <circle cx="12" cy="12" r="12" fill="#0EA5E9" />
        <circle cx="12" cy="12" r="6.5" fill="none" stroke="#fff" strokeWidth="1.5" />
        <path fill="none" stroke="#fff" strokeWidth="1.5" d="M5.5 12h13M12 5.5c-4.5 4-4.5 9 0 13 4.5-4 4.5-9 0-13z" />
      </svg>
    );
  }
  if (source === "canvassing") {
    return (
      <svg {...common}>
        <title>Canvassing</title>
        <circle cx="12" cy="12" r="12" fill="#8B5CF6" />
        <path fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" d="M6.5 12 12 7l5.5 5M8 11v6h8v-6" />
      </svg>
    );
  }
  // self-generated + other — the agent's own work, in the brand's dark tone.
  return (
    <svg {...common}>
      <title>{source === "self" ? "Self-generated" : "Other"}</title>
      <circle cx="12" cy="12" r="12" fill="#111827" />
      <path
        fill="none"
        stroke="#fff"
        strokeWidth="1.7"
        strokeLinecap="round"
        d="M12 7.5v9M7.5 12h9"
      />
    </svg>
  );
}
