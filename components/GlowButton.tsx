"use client";

import Link from "next/link";

// The hero's dark glass pill, dynamic edition: two starfield layers drift
// continuously at different speeds, a soft light chases the cursor
// (--mx/--my custom properties set per mousemove), and on hover the label
// fills bottom-to-top with Experts red (clip-path reveal on a duplicate
// span). All styling lives in globals.css under .btn-glow*.

export default function GlowButton({
  href,
  children,
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`btn-glow ${className}`}
      onMouseMove={(e) => {
        const el = e.currentTarget;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        el.style.setProperty(
          "--mx",
          `${((e.clientX - r.left) / r.width) * 100}%`
        );
        el.style.setProperty(
          "--my",
          `${((e.clientY - r.top) / r.height) * 100}%`
        );
      }}
    >
      <span className="btn-glow-stars" aria-hidden />
      <span className="btn-glow-stars2" aria-hidden />
      <span className="btn-glow-cursor" aria-hidden />
      <span className="relative">
        {children}
        <span className="btn-glow-fill" aria-hidden>
          {children}
        </span>
      </span>
    </Link>
  );
}
