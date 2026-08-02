"use client";

import { useEffect, useRef, useState } from "react";

/* The empathy beat, sitting after "how it works" and before the price.
   The order of the page is deliberate: what it is → why you can trust it →
   how it runs → we know what you're up against → what it costs. This is the
   section that has to land before anyone looks at a number.

   Every answer here is something the service actually does, taken from the
   partner pack — location exclusivity, monthly optimisation, lead nurture,
   the dashboard, the three-month minimum. Don't add a reassurance we can't
   back; this page deploys straight to the live site. */

const POINTS: { pain: string; answer: string; wide?: boolean }[] = [
  {
    pain: "You've paid for leads before and got nothing back.",
    answer:
      "You choose the spend and see exactly what it bought. Three months minimum because ads need time to learn your location — then rolling monthly, and you can adjust at any renewal.",
    wide: true,
  },
  {
    pain: "Leads cost more than they used to.",
    answer:
      "Every month we review what's working and adjust to bring your cost per lead down. That's included, not an upsell.",
  },
  {
    pain: "You haven't got time to learn Meta's ad manager.",
    answer:
      "You never touch it. We write the copy, build the creative, set the targeting and launch. Not a brief needed from you.",
  },
  {
    pain: "The leads you do get go cold before you can call them.",
    answer:
      "We keep talking to them on your behalf until they're ready for a conversation — so when you do call, they already know who you are.",
    wide: true,
  },
];

function Point({
  pain,
  answer,
  index,
  on,
}: {
  pain: string;
  answer: string;
  index: number;
  on: boolean;
}) {
  return (
    <div
      className="group border-t border-gray-900/10 pt-7 transition-[opacity,transform] duration-700 ease-out"
      style={{
        opacity: on ? 1 : 0,
        // The whole set cascades from ONE trigger — each point drops DOWN
        // into place a beat after the previous, the same presentation
        // rhythm as the proof section.
        transform: on ? "none" : "translateY(-36px)",
        transitionDelay: `${index * 120}ms`,
      }}
    >
      {/* The rule above each point draws itself in from the left. */}
      <span
        aria-hidden
        className="absolute -mt-7 block h-px bg-[var(--group)] transition-[width] duration-1000 ease-out"
        style={{ width: on ? "3rem" : "0rem", transitionDelay: `${index * 120 + 220}ms` }}
      />
      <p className="text-xl font-medium leading-snug text-gray-900 sm:text-2xl">
        {pain}
      </p>
      <p className="mt-3 max-w-md text-[15px] leading-relaxed text-gray-600">
        {answer}
      </p>
    </div>
  );
}

export default function PainPoints() {
  // One trigger for the whole set: the heading and subtext arrive with the
  // section, then a small scroll brings the grid into view and every point
  // drops down in sequence. A direct scroll-position check rather than an
  // IntersectionObserver, plus a failsafe timer — this content starts
  // hidden, so it must never get stuck invisible.
  const gridRef = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);

  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    let done = false;

    const check = () => {
      if (done) return;
      const vh = window.innerHeight || 800;
      const r = el.getBoundingClientRect();
      // Fire once the top of the grid is well inside the viewport.
      if (r.top < vh * 0.85 && r.bottom > 0) {
        done = true;
        setOn(true);
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", onScroll);
      }
    };
    const onScroll = () => check();

    check();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    // Safety net: never leave the points hidden.
    const failSafe = setTimeout(() => setOn(true), 6000);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      clearTimeout(failSafe);
    };
  }, []);

  return (
    <div className="mx-auto w-full max-w-7xl px-6 sm:px-10">
      {/* Heading holds a narrow column on the left and the points run in an
          uneven grid beside it — no centred header, no equal columns. */}
      <div className="grid gap-14 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)] lg:gap-20">
        <div>
          {/* Always exactly two lines — the second is kept whole. */}
          <h2 className="text-4xl font-light leading-[1.05] tracking-[-0.035em] text-gray-900 sm:text-5xl">
            We know what
            <br />
            <span className="whitespace-nowrap">you&apos;re up against.</span>
          </h2>
          <p className="mt-6 max-w-sm text-lg leading-relaxed text-gray-600">
            Nobody needs another invoice for something that didn&apos;t work.
            Here&apos;s what we hear from agents — and what we actually do
            about it.
          </p>
        </div>

        {/* Uneven on purpose: two of the six run full width, so the column
            doesn't march down the page in matching pairs. */}
        <div ref={gridRef} className="grid gap-x-10 gap-y-10 sm:grid-cols-2">
          {POINTS.map((p, i) => (
            <div
              key={p.pain}
              className={`relative ${p.wide ? "sm:col-span-2" : ""}`}
            >
              <Point pain={p.pain} answer={p.answer} index={i} on={on} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
