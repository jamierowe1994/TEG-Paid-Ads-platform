"use client";

// Small circular button in the footer card that scrolls back to the top of
// the page. Client component purely for the click handler.
export default function BackToTop({ className = "" }: { className?: string }) {
  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Back to top"
      className={`flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition hover:border-transparent hover:bg-[var(--group)] hover:text-white ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 19V5" />
        <path d="m5 12 7-7 7 7" />
      </svg>
    </button>
  );
}
