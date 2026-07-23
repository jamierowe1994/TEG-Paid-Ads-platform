"use client";

import BrandMark from "@/components/BrandMark";
import { EXPERTS_GROUP } from "@/lib/brands";

// Mobile-only welcome/loading splash — "The Experts Group" with a "Loading"
// line and three pulsing dots, centred. Shown while the app checks the session
// on a phone, so the first thing people see is a warm, branded moment rather
// than a bare "Loading…". Hidden on desktop (lg+), which keeps its existing
// minimal loading text untouched.
export default function MobileLoading() {
  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-white lg:hidden">
      <BrandMark
        name={EXPERTS_GROUP.name}
        accent={EXPERTS_GROUP.accent}
        logo={EXPERTS_GROUP.logo}
        size={64}
        rounded="rounded-2xl"
      />
      <p className="mt-5 text-xl font-semibold tracking-tight text-gray-900">
        The Experts Group
      </p>
      <div className="mt-4 flex items-center gap-2 text-gray-400">
        <span className="text-sm font-medium">Loading</span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-300 [animation-delay:0ms]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-300 [animation-delay:150ms]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-300 [animation-delay:300ms]" />
        </span>
      </div>
    </div>
  );
}
