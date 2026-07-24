"use client";

// Mobile-only launch/loading splash — the "Launch Pad" lockup: the Experts
// Group pin on the left with the "Launch Pad" wordmark (tight, stacked) beside
// it, over a soft frosted-white wash so it reads as a clean glass moment while
// the app checks the session. Hidden on desktop (lg+).
export default function MobileLoading() {
  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center lg:hidden"
      style={{
        background:
          "radial-gradient(120% 90% at 50% 32%, #ffffff 0%, #eef0f2 100%)",
      }}
    >
      <div className="flex items-center gap-4">
        {/* Experts Group pin (transparent PNG) */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand-logos/group-black.png"
          alt=""
          className="h-[78px] w-auto"
        />
        <div className="flex flex-col leading-[0.86] tracking-[-0.045em] text-gray-900">
          <span className="text-[42px] font-semibold">Launch</span>
          <span className="text-[42px] font-semibold">Pad</span>
        </div>
      </div>

      <div className="mt-10 flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-300 [animation-delay:0ms]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-300 [animation-delay:150ms]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-300 [animation-delay:300ms]" />
      </div>
    </div>
  );
}
