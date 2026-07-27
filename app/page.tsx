import Link from "next/link";
import { BRANDS, EXPERTS_GROUP } from "@/lib/brands";
import { PACKAGES } from "@/lib/packages";
import Reveal from "@/components/Reveal";
import HeroAdWord from "@/components/HeroAdWord";
import PhysicsIcons from "@/components/PhysicsIcons";
import HeroIconStrip from "@/components/HeroIconStrip";
import GlowButton from "@/components/GlowButton";
import LeadsStat from "@/components/LeadsStat";
import PanelReveal from "@/components/PanelReveal";
import BackgroundTexture from "@/components/BackgroundTexture";
import Parallax from "@/components/Parallax";
import SmoothScroll from "@/components/SmoothScroll";
import ContourClip from "@/components/ContourClip";
import ScrollFillText from "@/components/ScrollFillText";
import StandaloneGuard from "@/components/StandaloneGuard";

// The hero's backdrop. Kept as a constant because the rocket's window is
// punched out in this exact colour.
const HERO_BG = "#08080a";

// The Launch Pad rocket, matching the installed app icon. White on the black
// hero; the porthole is punched in the hero colour rather than filled white.
function LaunchPadMark() {
  return (
    <svg
      viewBox="0 0 512 512"
      className="h-11 w-11 sm:h-12 sm:w-12"
      fill="#ffffff"
      aria-hidden
    >
      <g transform="rotate(45 256 256) translate(0 -8)">
        <path d="M256 80 C298 122 300 194 298 268 C298 302 293 330 284 350 L228 350 C219 330 214 302 214 268 C212 194 214 122 256 80 Z" />
        <path d="M214 266 L172 356 L221 335 Z" />
        <path d="M298 266 L340 356 L291 335 Z" />
        <path d="M232 350 L239 372 L273 372 L280 350 Z" />
        <rect x="248" y="392" width="16" height="78" rx="8" />
        <rect x="214" y="404" width="14" height="56" rx="7" />
        <rect x="284" y="404" width="14" height="56" rx="7" />
        <circle cx="256" cy="172" r="32" fill={HERO_BG} />
      </g>
    </svg>
  );
}

export default function LandingPage() {
  // No bg-white on <main> — the body provides the white base so the fixed
  // -z-10 texture/glows show through the transparent sections.
  return (
    <main className="relative min-h-screen overflow-x-clip">
      <StandaloneGuard />
      <SmoothScroll />
      {/* Reveals the red contour copy only within the frosted panel's rect */}
      <ContourClip targetId="built" />
      {/* Subtle background — soft brand-tinted glows + a faint contour
          texture, showing through the transparent (white) sections while the
          charcoal panel and footer sit on top of it. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          backgroundImage:
            "radial-gradient(60% 50% at 15% 6%, rgba(227,31,54,0.09), transparent 62%)," +
            "radial-gradient(50% 45% at 90% 12%, rgba(43,97,147,0.085), transparent 62%)," +
            "radial-gradient(55% 50% at 78% 92%, rgba(227,31,54,0.07), transparent 62%)," +
            "radial-gradient(45% 40% at 8% 80%, rgba(43,97,147,0.06), transparent 62%)",
        }}
      />
      {/* Topographic contour texture across all white sections */}
      <BackgroundTexture />
      {/* Red copy of the same texture, revealed only under the frosted panel */}
      <BackgroundTexture tint />

      {/* Nav — just the Launch Pad mark, then See pricing + Sign in. Sits over
          the black hero, so everything here is white. */}
      <header className="absolute inset-x-0 top-0 z-40">
        <div className="mx-auto flex h-24 max-w-7xl items-center justify-between px-6 sm:h-28 sm:px-10">
          <Link href="/" aria-label="Launch Pad" className="flex items-center">
            <LaunchPadMark />
          </Link>
          <div className="flex items-center gap-2.5 sm:gap-3">
            <a
              href="#packages"
              className="rounded-full border border-white/25 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-white/10 sm:px-7 sm:py-3 sm:text-base"
            >
              See pricing
            </a>
            <Link
              href="/login"
              className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-gray-900 transition hover:bg-white/90 sm:px-7 sm:py-3 sm:text-base"
            >
              Sign in
            </Link>
          </div>
        </div>
      </header>

      {/* Hero — full screen, clean white, icons along the bottom. The hero
          block owns min-h-screen and self-centres, so the heading sits dead
          centre of the viewport at any screen height (the icon strip adds
          height below without shifting the centre). */}
      <section
        className="relative flex flex-col text-white"
        style={{ backgroundColor: HERO_BG }}
      >
        <Parallax speed={0.46} max={360} className="flex min-h-screen flex-col items-center justify-center px-6 py-24 text-center">
          <Reveal>
            {/* nowrap keeps "Our ad engine." on one line while the hidden
                card expands on hover */}
            <h1 className="mx-auto max-w-6xl text-5xl font-light leading-[0.95] tracking-[-0.05em] text-white sm:text-7xl lg:text-8xl">
              Your personal brand.
              <br />
              <span className="lg:whitespace-nowrap">
                Our <HeroAdWord /> engine.
              </span>
            </h1>
            <p className="mx-auto mt-8 max-w-2xl text-lg font-light text-white/60 sm:text-xl">
              We build and run paid social campaigns for Experts Group agents
              — you track every lead from first click to your CRM, all in one
              clean dashboard.
            </p>
            <div className="mt-12 flex items-center justify-center gap-4">
              {/* .btn-glass hard-sets a near-black label for light pages, so
                  the hero's copy is forced white over the black backdrop. */}
              <GlowButton
                href="/signup"
                className="px-10 py-4 text-base font-semibold !text-white"
              >
                Choose your package
              </GlowButton>
            </div>
          </Reveal>
        </Parallax>
        {/* Social platforms strip — sits quietly at the foot of the hero. */}
        <div className="mx-auto w-full max-w-5xl px-6 pb-14">
          <HeroIconStrip />
        </div>
      </section>

      {/* Second screen — charcoal rounded panel with breathing room above
          and below: bold copy left, photo + infographic right, physics icons
          landing at the bottom */}
      <section id="built" className="px-4 py-20 sm:px-14 sm:py-28">
        {/* PanelReveal is a plain (untransformed) wrapper; the parallax
            transform lives on the glass panel itself. This matters: a
            transformed ANCESTOR establishes a backdrop root that blanks the
            panel's backdrop-filter — so the frost must sit on the same element
            that carries the transform, not a parent. */}
        <PanelReveal>
        <Parallax
          mode="element"
          strength={-190}
          max={210}
          className="glass-panel relative flex min-h-[64vh] flex-col overflow-hidden rounded-[2.5rem]"
        >
          <div className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-8 py-12 sm:px-12 lg:grid-cols-2">
            <div className="p-words">
              <span className="inline-block rounded-full bg-[#E31F36] px-4 py-1.5 text-sm font-medium text-white">
                Built for agents
              </span>
              <h2 className="mt-5 max-w-lg text-4xl font-semibold leading-[1.05] tracking-tight text-gray-900 sm:text-5xl">
                Paid ads that stop the scroll.
              </h2>
              <p className="mt-5 max-w-md text-lg leading-relaxed text-gray-600">
                Seven businesses, one engine. We run your campaigns on the
                platforms that matter, branded as you — so your patch sees
                your face, not a faceless portal.
              </p>
              <div className="mt-8">
                <Link
                  href="/signup"
                  className="btn-group inline-block rounded-xl px-8 py-4 text-base font-semibold shadow-[0_14px_30px_-8px_rgba(227,31,54,0.45)]"
                >
                  Start your campaign
                </Link>
              </div>
            </div>
            <div className="relative mx-auto w-full max-w-md lg:mr-0 lg:max-w-xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/paid-ads.jpg"
                alt="An agent's next client, mid-scroll"
                className="p-image aspect-[4/5] w-full rounded-3xl object-cover shadow-2xl"
              />
              {/* Infographic overlay — expands after the image, then counts */}
              <LeadsStat className="p-stat" startDelay={1500} />
            </div>
          </div>

          {/* Landing zone so settled icons don't sit on the content — extra
              room lets them fall lower */}
          <div className="h-32" />
          {/* The hero's icons fall in behind the pills and hit the bottom */}
          <PhysicsIcons />
        </Parallax>
        </PanelReveal>
      </section>

      {/* One group, seven businesses — moved out below the frosted panel.
          Monochrome black-and-white pills that fill with their own brand
          colour only when you hover that individual pill. */}
      <section className="px-6 pb-10">
        <Reveal>
          <p className="text-center text-xs font-medium uppercase tracking-widest text-gray-900">
            One group, seven businesses
          </p>
          <div className="mx-auto mt-5 flex max-w-5xl flex-wrap items-center justify-center gap-3">
            {BRANDS.map((b) => (
              <span
                key={b.id}
                className="brand-pill rounded-full px-4 py-2 text-sm font-medium"
                style={{ "--pill": b.accent } as React.CSSProperties}
              >
                {b.name}
              </span>
            ))}
          </div>
        </Reveal>
      </section>

      {/* How it works — steps left, mock dashboard right */}
      <section id="how" className="mx-auto max-w-6xl px-6 py-28">
        <Parallax mode="element" strength={-70} max={110}>
        <div className="grid items-center gap-16 lg:grid-cols-2">
          {/* Steps */}
          <div>
            <Reveal>
              <h2 className="text-4xl font-semibold tracking-tight">
                How it works
              </h2>
              <p className="mt-3 max-w-md text-gray-500">
                From signup to signed business in three steps — everything
                tracked in your own dashboard.
              </p>
            </Reveal>
            <div className="mt-12 space-y-0">
              {[
                {
                  n: "1",
                  title: "Pick a package",
                  body: "Choose the level that fits your goals and pay securely online. Sign up with your work email and we route you straight to your business's portal.",
                },
                {
                  n: "2",
                  title: "We build your ads",
                  body: "Tell us your platforms and goals. Our team prepares your creatives and launches your campaigns — marketed as you, personalised to your patch.",
                },
                {
                  n: "3",
                  title: "Track every lead",
                  body: "Leads land in your portal in real time. Work them through your funnel, convert them, and push them straight into your CRM with one click.",
                },
              ].map((s, i) => (
                <Reveal key={s.n} delay={i * 120}>
                  <div className="group flex gap-5 pb-10 last:pb-0">
                    <div className="flex flex-col items-center">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-gray-200 text-sm font-semibold text-gray-900 transition group-hover:border-[#E31F36] group-hover:bg-[#E31F36] group-hover:text-white">
                        {s.n}
                      </div>
                      {i < 2 && (
                        <div className="mt-2 w-px flex-1 bg-gray-100" />
                      )}
                    </div>
                    <div className="pt-1.5">
                      <h3 className="text-lg font-semibold">{s.title}</h3>
                      <p className="mt-2 max-w-sm text-sm leading-relaxed text-gray-500">
                        {s.body}
                      </p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>

          {/* Mock dashboard */}
          <Reveal direction="right" delay={150}>
            <div className="relative">
              {/* soft backdrop blob */}
              <div className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-gradient-to-br from-red-50 via-white to-gray-50" />
              <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl">
                {/* window chrome */}
                <div className="flex items-center gap-1.5 border-b border-gray-100 bg-gray-50/60 px-4 py-3">
                  <span className="h-2.5 w-2.5 rounded-full bg-gray-200" />
                  <span className="h-2.5 w-2.5 rounded-full bg-gray-200" />
                  <span className="h-2.5 w-2.5 rounded-full bg-gray-200" />
                  <span className="ml-3 text-[10px] text-gray-400">
                    portal.theexpertsgroup.co.uk/dashboard
                  </span>
                </div>
                <div className="flex">
                  {/* mini sidebar */}
                  <div className="hidden w-36 shrink-0 border-r border-gray-100 bg-gray-50/40 p-3 sm:block">
                    <div className="flex items-center gap-1.5">
                      <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[#E31F36] text-[9px] font-bold text-white">
                        E
                      </div>
                      <div className="text-[9px] font-semibold leading-tight">
                        The Property
                        <br />
                        Experts
                      </div>
                    </div>
                    <div className="mt-4 space-y-1">
                      {["Overview", "Leads", "Referrals", "Grow"].map(
                        (item, i) => (
                          <div
                            key={item}
                            className={`rounded-md px-2 py-1.5 text-[10px] font-medium ${
                              i === 1
                                ? "bg-white text-gray-900 shadow-sm ring-1 ring-gray-100"
                                : "text-gray-400"
                            }`}
                          >
                            {item}
                          </div>
                        )
                      )}
                    </div>
                  </div>
                  {/* main */}
                  <div className="flex-1 p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold">Morning, James 👋</p>
                      <span className="flex items-center gap-1.5 rounded-full bg-green-50 px-2 py-0.5 text-[9px] font-semibold text-green-600">
                        <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-green-500" />
                        Ads live
                      </span>
                    </div>
                    {/* stats */}
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {[
                        { label: "Leads", value: "24" },
                        { label: "Cost / lead", value: "£4.12" },
                        { label: "MAs booked", value: "6" },
                      ].map((s) => (
                        <div
                          key={s.label}
                          className="rounded-lg border border-gray-100 p-2"
                        >
                          <p className="text-[9px] text-gray-400">{s.label}</p>
                          <p className="mt-0.5 text-sm font-semibold">
                            {s.value}
                          </p>
                        </div>
                      ))}
                    </div>
                    {/* funnel */}
                    <div className="mt-3 rounded-lg border border-gray-100 p-2.5">
                      <p className="text-[9px] font-medium text-gray-400">
                        YOUR FUNNEL
                      </p>
                      <div className="mt-1.5 flex items-center gap-1">
                        {[100, 75, 45, 25].map((w, i) => (
                          <div
                            key={i}
                            className="h-1.5 rounded-full"
                            style={{
                              width: `${w / 4}%`,
                              backgroundColor:
                                i < 3 ? "#E31F36" : "#FECDD3",
                            }}
                          />
                        ))}
                      </div>
                      <div className="mt-1 flex justify-between text-[8px] text-gray-400">
                        <span>New</span>
                        <span>Contacted</span>
                        <span>MA booked</span>
                        <span>In REX</span>
                      </div>
                    </div>
                    {/* lead rows */}
                    {[
                      {
                        name: "Sarah Mitchell",
                        src: "Facebook",
                        stage: "New",
                        stageColor: "#FEF2F2",
                        stageText: "#E31F36",
                      },
                      {
                        name: "Tom Barker",
                        src: "Instagram",
                        stage: "MA booked",
                        stageColor: "#F0FDF4",
                        stageText: "#16A34A",
                      },
                    ].map((l) => (
                      <div
                        key={l.name}
                        className="mt-2 flex items-center justify-between rounded-lg border border-gray-100 p-2.5"
                      >
                        <div>
                          <p className="text-[10px] font-semibold">{l.name}</p>
                          <p className="text-[9px] text-gray-400">
                            via {l.src}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span
                            className="rounded-full px-2 py-0.5 text-[8px] font-semibold"
                            style={{
                              backgroundColor: l.stageColor,
                              color: l.stageText,
                            }}
                          >
                            {l.stage}
                          </span>
                          {l.stage === "MA booked" && (
                            <span className="rounded-md bg-gray-900 px-2 py-1 text-[8px] font-semibold text-white">
                              Push to REX →
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
        </Parallax>
      </section>

      {/* Statement piece — right-aligned to the same max-w-6xl right edge as
          the mock dashboard above it. */}
      <section className="px-6 py-32">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <div className="ml-auto max-w-4xl text-right">
              <ScrollFillText
                text="“The average person scrolls through their feed every single day. Your next client is in that scroll.”"
                className="text-4xl font-bold leading-[1.1] tracking-[-0.055em] text-gray-900 sm:text-5xl lg:text-6xl"
              />
              <p className="mt-10 text-xl font-semibold tracking-[-0.02em] text-[#E31F36]">
                #StopTheScroll
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Showcase — mocked ad creatives until real campaign shots arrive.
          TODO(showcase): swap mocks for real ads + add the filter-by-brand
          chips once enough brands are live. */}
      <section>
        <Parallax mode="element" strength={-70} max={110}>
        <div className="mx-auto max-w-6xl px-6 py-28">
          <Reveal>
            <h2 className="mx-auto max-w-2xl text-center text-4xl font-semibold tracking-tight">
              Our agents, putting themselves out there
            </h2>
            <p className="mx-auto mt-3 max-w-md text-center text-gray-500">
              Every campaign is branded as the agent, not the group — here's
              the kind of ad your patch will be seeing.
            </p>
          </Reveal>

          <div className="mt-16 grid gap-x-10 gap-y-16 lg:grid-cols-2">
            {/* Mock ad 1 — Property */}
            <Reveal>
              <div>
                <div className="relative flex aspect-[4/5] flex-col justify-between overflow-hidden rounded-2xl bg-gradient-to-br from-[#E31F36] to-[#8f1322] p-8 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-sm font-bold text-white">
                      JR
                    </div>
                    <div className="leading-tight text-white">
                      <p className="text-sm font-semibold">James Rowe</p>
                      <p className="text-xs text-white/60">
                        The Property Experts · Sponsored
                      </p>
                    </div>
                  </div>
                  <div>
                    <p className="max-w-xs text-4xl font-semibold leading-tight text-white">
                      Thinking of selling this year?
                    </p>
                    <p className="mt-3 max-w-xs text-white/70">
                      Find out what your home is really worth — free market
                      appraisal, no obligation.
                    </p>
                    <span className="mt-6 inline-block rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-gray-900">
                      Book my free appraisal
                    </span>
                  </div>
                  <p className="text-right text-xs font-semibold uppercase tracking-[0.25em] text-white/50">
                    The Property Experts
                  </p>
                </div>
                <p className="mt-5 text-sm leading-relaxed text-gray-500">
                  Personal-brand lead generation for estate agents — appraisal
                  bookings straight from the agent's own feed.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {["Property", "Social Ads", "Lead Gen"].map((t) => (
                    <span
                      key={t}
                      className="rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </Reveal>

            {/* Mock ad 2 — Mortgage (offset for the staggered gallery feel) */}
            <Reveal delay={120} className="lg:mt-24">
              <div>
                <div className="relative flex aspect-[4/3] flex-col justify-between overflow-hidden rounded-2xl bg-gradient-to-br from-[#2B6193] to-[#173954] p-8 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-sm font-bold text-white">
                      SK
                    </div>
                    <div className="leading-tight text-white">
                      <p className="text-sm font-semibold">Sofia Khan</p>
                      <p className="text-xs text-white/60">
                        The Mortgage Experts · Sponsored
                      </p>
                    </div>
                  </div>
                  <div>
                    <p className="max-w-sm text-3xl font-semibold leading-tight text-white">
                      Fixed rate ending soon?
                    </p>
                    <p className="mt-2 max-w-sm text-white/70">
                      Beat the jump — book a free remortgage review this week.
                    </p>
                    <span className="mt-5 inline-block rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-gray-900">
                      Book my review
                    </span>
                  </div>
                  <p className="text-right text-xs font-semibold uppercase tracking-[0.25em] text-white/50">
                    The Mortgage Experts
                  </p>
                </div>
                <p className="mt-5 text-sm leading-relaxed text-gray-500">
                  Remortgage appointment campaigns for advisers — timed to
                  fixed-rate renewal windows in their area.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {["Mortgage", "Social Ads", "Appointments"].map((t) => (
                    <span
                      key={t}
                      className="rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>

          <p className="mt-16 text-center text-sm text-gray-400">
            Live campaign showcases landing soon — filter by brand arrives
            with them.
          </p>
        </div>
        </Parallax>
      </section>

      {/* Packages */}
      <section id="packages">
        <div className="mx-auto max-w-6xl px-6 py-28">
          <Reveal>
            <h2 className="text-center text-4xl font-semibold tracking-tight">
              Simple packages, no surprises
            </h2>
            <p className="mx-auto mt-3 max-w-md text-center text-gray-500">
              Every package includes your own lead-tracking dashboard and
              access to the Experts Group referral network.
            </p>
          </Reveal>
          <div className="mt-16 grid gap-6 lg:grid-cols-3">
            {PACKAGES.map((p, i) => (
              <Reveal key={p.id} delay={i * 120} className="h-full">
                <div
                  className={`lift-card relative flex h-full flex-col rounded-2xl border bg-white p-8 ${
                    p.highlighted
                      ? "border-gray-900 shadow-lg"
                      : "border-gray-200"
                  }`}
                >
                  {p.highlighted && (
                    <span className="btn-group absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-medium">
                      Most popular
                    </span>
                  )}
                  <h3 className="text-lg font-semibold">{p.name}</h3>
                  <p className="mt-1 text-sm text-gray-500">{p.tagline}</p>
                  <div className="mt-6 flex items-baseline gap-1">
                    <span className="text-4xl font-semibold tracking-tight">
                      £{p.price}
                    </span>
                    <span className="text-sm text-gray-400">/month</span>
                  </div>
                  <ul className="mt-8 flex-1 space-y-3">
                    {p.features.map((f) => (
                      <li key={f} className="flex gap-3 text-sm text-gray-600">
                        <svg
                          className="mt-0.5 h-4 w-4 shrink-0"
                          style={{ color: EXPERTS_GROUP.accent }}
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 111.4-1.4L8 12.6l7.3-7.3a1 1 0 011.4 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={`/signup?package=${p.id}`}
                    className={`mt-8 rounded-xl py-3 text-center text-sm font-medium transition ${
                      p.highlighted
                        ? "btn-group"
                        : "btn-press border border-gray-200 text-gray-900 hover:bg-gray-50"
                    }`}
                  >
                    Choose {p.name}
                  </Link>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Footer — black panel, big rounded corners, inset from the edges */}
      <footer className="px-3 pb-3 pt-16">
        <div className="rounded-[2.5rem] bg-gray-950 px-8 py-14 text-white sm:px-14">
          <div className="mx-auto max-w-6xl">
            {/* CTA row */}
            <div className="flex flex-col items-start justify-between gap-8 border-b border-white/10 pb-12 lg:flex-row lg:items-center">
              <h2 className="max-w-md text-3xl font-semibold tracking-tight sm:text-4xl">
                Ready to be unmissable in your patch?
              </h2>
              <Link
                href="/signup"
                className="btn-press rounded-xl bg-white px-8 py-4 text-base font-semibold text-gray-900 shadow-lg transition hover:bg-gray-200"
              >
                Choose your package
              </Link>
            </div>

            {/* Link columns */}
            <div className="grid gap-10 pt-12 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/brand-logos/group-white.png"
                  alt="The Experts Group"
                  className="h-12 w-auto"
                />
                <p className="mt-4 max-w-xs text-sm text-white/50">
                  Paid ads, built and run for Experts Group agents — tracked
                  from first click to your CRM.
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-white/40">
                  Portal
                </p>
                <ul className="mt-4 space-y-2.5 text-sm text-white/70">
                  <li>
                    <Link href="/login" className="hover:text-white">
                      Sign in
                    </Link>
                  </li>
                  <li>
                    <Link href="/signup" className="hover:text-white">
                      Create your account
                    </Link>
                  </li>
                  <li>
                    <a href="#packages" className="hover:text-white">
                      Packages
                    </a>
                  </li>
                  <li>
                    <Link href="/admin" className="hover:text-white">
                      Admin
                    </Link>
                  </li>
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-white/40">
                  The group
                </p>
                <ul className="mt-4 space-y-2.5 text-sm text-white/70">
                  {BRANDS.map((b) => (
                    <li key={b.id}>{b.name}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-white/40">
                  Contact
                </p>
                <ul className="mt-4 space-y-2.5 text-sm text-white/70">
                  <li>
                    <a
                      href="mailto:info@theexpertsgroup.co.uk"
                      className="hover:text-white"
                    >
                      info@theexpertsgroup.co.uk
                    </a>
                  </li>
                  <li className="text-white/40">
                    Spotted something? Use the pencil, bottom right.
                  </li>
                </ul>
              </div>
            </div>

            {/* Legal row */}
            <div className="mt-14 flex flex-col items-center justify-between gap-3 border-t border-white/10 pt-6 text-xs text-white/40 sm:flex-row">
              <span>© {new Date().getFullYear()} The Experts Group</span>
              <div className="flex gap-6">
                <span>Privacy</span>
                <span>Terms</span>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
