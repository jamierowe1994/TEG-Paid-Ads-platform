"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

// Mobile-only bottom sheet for the landing page — content that would run the
// page long on a phone (the trial's supporting stats, the pain points) sits
// behind a tap instead. Portalled to <body> so an animated/transformed
// ancestor (Reveal, PanelReveal) can never become its containing block and
// pin the "fixed" overlay mid-page.
export default function MobileSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Hold the page still behind the sheet, and let Escape close it.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-[100] sm:hidden ${open ? "" : "pointer-events-none"}`}
      aria-hidden={!open}
    >
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-[1.75rem] bg-[#f7f7f8] px-6 pb-12 pt-3 shadow-[0_-18px_50px_-20px_rgba(0,0,0,0.35)] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <span
          aria-hidden
          className="mx-auto block h-1 w-10 rounded-full bg-gray-300"
        />
        <div className="mt-5 flex items-center justify-between gap-4">
          <p className="text-lg font-semibold tracking-tight text-gray-900">
            {title}
          </p>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-900/8 text-sm text-gray-600"
          >
            ✕
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>,
    document.body
  );
}
