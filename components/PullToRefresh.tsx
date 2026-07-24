"use client";

import { useEffect, useRef, useState } from "react";

// Pull-to-refresh for the mobile app: drag DOWN from the very top of the page
// and a refresh icon slides in; release past the threshold and onRefresh()
// runs (re-checks for new leads / updates) while the icon spins.
//
// Mobile only — attaches native touch listeners so it can preventDefault the
// browser's own over-scroll once engaged. It stays out of the way when a
// sheet/modal has locked body scroll (so pulling inside one never fires it).

const THRESHOLD = 72; // px of resisted pull needed to trigger
const MAX = 120;

export default function PullToRefresh({
  onRefresh,
}: {
  onRefresh: () => Promise<void>;
}) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const pullRef = useRef(0);
  const refreshingRef = useRef(false);
  const startY = useRef<number | null>(null);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    const setPullBoth = (v: number) => {
      pullRef.current = v;
      setPull(v);
    };
    const setRefreshingBoth = (v: boolean) => {
      refreshingRef.current = v;
      setRefreshing(v);
    };
    const locked = () => document.body.style.overflow === "hidden";

    function onStart(e: TouchEvent) {
      if (refreshingRef.current || locked() || window.scrollY > 0) {
        startY.current = null;
        return;
      }
      startY.current = e.touches[0].clientY;
    }
    function onMove(e: TouchEvent) {
      if (startY.current == null || refreshingRef.current) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0 || window.scrollY > 0) {
        if (pullRef.current) setPullBoth(0);
        return;
      }
      const p = Math.min(dy * 0.5, MAX); // rubber-band resistance
      setPullBoth(p);
      if (p > 3 && e.cancelable) e.preventDefault(); // block native over-scroll
    }
    async function onEnd() {
      if (startY.current == null) return;
      const reached = pullRef.current >= THRESHOLD;
      startY.current = null;
      if (reached && !refreshingRef.current) {
        setRefreshingBoth(true);
        setPullBoth(THRESHOLD);
        const started = Date.now();
        try {
          await onRefreshRef.current();
        } catch {
          /* ignore — just stop spinning */
        }
        // Let the spinner read for a beat even if the fetch was instant.
        const rest = 550 - (Date.now() - started);
        if (rest > 0) await new Promise((r) => setTimeout(r, rest));
        setRefreshingBoth(false);
        setPullBoth(0);
      } else {
        setPullBoth(0);
      }
    }

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  const progress = Math.min(pull / THRESHOLD, 1);
  const show = pull > 0 || refreshing;

  return (
    <div
      aria-hidden={!refreshing}
      className="pointer-events-none fixed inset-x-0 top-0 z-[85] flex justify-center lg:hidden"
      style={{ opacity: show ? 1 : 0, transition: startY.current ? "none" : "opacity 0.2s" }}
    >
      <div
        className="mt-[env(safe-area-inset-top)] flex h-10 w-10 items-center justify-center rounded-full border border-black/5 bg-white shadow-lg"
        style={{
          transform: `translateY(${(refreshing ? THRESHOLD : pull) * 0.55 + 6}px) scale(${0.5 + progress * 0.5})`,
          transition: startY.current ? "none" : "transform 0.28s cubic-bezier(0.22,1,0.36,1)",
        }}
      >
        <svg
          className={`h-5 w-5 text-gray-700 ${refreshing ? "animate-spin" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={refreshing ? undefined : { transform: `rotate(${progress * 300}deg)` }}
        >
          <path d="M21 12a9 9 0 1 1-2.64-6.36" />
          <path d="M21 3v6h-6" />
        </svg>
      </div>
    </div>
  );
}
