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
      "You choose the spend and see exactly what it bought. Three months minimum because ads need time to learn your patch — then rolling monthly, and you can adjust at any renewal.",
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
  {
    pain: "You never really know where the money went.",
    answer:
      "Your own dashboard: spend, reach, engagement, every lead and where it sits in your funnel, in real time. No waiting on a monthly report.",
  },
  {
    pain: "The agent down the road could run the same ad.",
    answer:
      "They can't. Your area is yours — no other agent in your patch runs the same campaign.",
  },
];

function Point({
  pain,
  answer,
  index,
}: {
  pain: string;
  answer: string;
  index: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setOn(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setOn(true);
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="group border-t border-white/12 pt-7 transition-[opacity,transform] duration-700 ease-out"
      style={{
        opacity: on ? 1 : 0,
        // Staggered down the list rather than all at once — the eye reads
        // one pain at a time.
        transform: on ? "none" : "translateY(28px)",
        transitionDelay: `${(index % 3) * 110}ms`,
      }}
    >
      {/* The rule above each point draws itself in from the left. */}
      <span
        aria-hidden
        className="absolute -mt-7 block h-px bg-[var(--group)] transition-[width] duration-1000 ease-out"
        style={{ width: on ? "3rem" : "0rem", transitionDelay: `${(index % 3) * 110 + 220}ms` }}
      />
      <p className="text-xl font-medium leading-snug text-white sm:text-2xl">
        {pain}
      </p>
      <p className="mt-3 max-w-md text-[15px] leading-relaxed text-white/55">
        {answer}
      </p>
    </div>
  );
}

export default function PainPoints() {
  return (
    <div className="mx-auto w-full max-w-7xl px-6 sm:px-10">
      {/* Heading holds a narrow column on the left and the points run in an
          uneven grid beside it — no centred header, no equal columns. */}
      <div className="grid gap-14 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)] lg:gap-20">
        <div>
          <h2 className="text-4xl font-light leading-[1.05] tracking-[-0.035em] text-white sm:text-5xl">
            We know what
            <br className="hidden sm:block" /> you&apos;re up against.
          </h2>
          <p className="mt-6 max-w-sm text-lg leading-relaxed text-white/60">
            Nobody needs another invoice for something that didn&apos;t work.
            Here&apos;s what we hear from agents — and what we actually do
            about it.
          </p>
        </div>

        {/* Uneven on purpose: two of the six run full width, so the column
            doesn't march down the page in matching pairs. */}
        <div className="grid gap-x-10 gap-y-10 sm:grid-cols-2">
          {POINTS.map((p, i) => (
            <div
              key={p.pain}
              className={`relative ${p.wide ? "sm:col-span-2" : ""}`}
            >
              <Point pain={p.pain} answer={p.answer} index={i} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
