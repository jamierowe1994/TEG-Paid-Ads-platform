import Link from "next/link";
import {
  PACKAGES,
  MANAGEMENT_FEE,
  INCLUDED_IN_EVERY_PACKAGE,
  PACKAGE_TERMS,
} from "@/lib/packages";
import Reveal from "@/components/Reveal";
import HeroAdWord from "@/components/HeroAdWord";
import HeroIconStrip from "@/components/HeroIconStrip";
import LeadsStat from "@/components/LeadsStat";
import MobileParallax from "@/components/MobileParallax";
import PanelReveal from "@/components/PanelReveal";
import ProofHowScene from "@/components/ProofHowScene";
import ExpandingSlab from "@/components/ExpandingSlab";
import SmoothScroll from "@/components/SmoothScroll";
import StandaloneGuard from "@/components/StandaloneGuard";
import PlugIntoStack from "@/components/PlugIntoStack";
import HowItWorksPhone from "@/components/HowItWorksPhone";
import TrialProof from "@/components/TrialProof";
import PainPoints from "@/components/PainPoints";
import BackToTop from "@/components/BackToTop";
import ICONS, { SocialIcon } from "@/components/SocialIcons";

// The site's backdrop — a very light grey that runs the length of the page.
// Kept as a constant because the rocket's window is punched out in it.
const HERO_BG = "#f4f4f5";

// The Launch Pad rocket, matching the installed app icon. Near-black on the
// light hero; the porthole is punched in the backdrop colour rather than
// filled in.
function LaunchPadMark() {
  return (
    <svg
      viewBox="0 0 512 512"
      className="h-12 w-12 sm:h-14 sm:w-14"
      fill="#16171a"
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
    // overflow-x-clip is scoped to mobile now. An ancestor with any non-visible
    // overflow becomes the sticky containing block, and since <main> doesn't
    // scroll, `position: sticky` on the panels below had nothing to stick to —
    // they just scrolled normally. Desktop gets the stacking effect; mobile
    // keeps the sideways-drift guard (which is only a mobile problem anyway,
    // and <html> already carries overflow-x: hidden under 1024px).
    <main className="landing-light relative min-h-screen max-lg:overflow-x-clip">
      <StandaloneGuard />
      <SmoothScroll />
      {/* The light grey backdrop, fixed so it runs the whole length of the page. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-20"
        style={{ backgroundColor: HERO_BG }}
      />
      {/* Nav — just the Launch Pad mark, then the pack, pricing and Sign in.
          Sits over the light hero, so everything here is near-black. */}
      <header className="absolute inset-x-0 top-0 z-40">
        <div className="mx-auto flex h-24 max-w-7xl items-center justify-between px-6 sm:h-28 sm:px-10">
          <Link
            href="/"
            aria-label="Launch Pad"
            className="hero-nav flex items-center"
          >
            <LaunchPadMark />
          </Link>
          <div className="hero-nav flex items-center gap-2.5 sm:gap-3">
            {/* Hidden on mobile — the phone header is just the mark and
                Sign in; pricing is one scroll away anyway. */}
            <a
              href="#packages"
              className="px-2 py-2.5 text-sm font-medium text-gray-600 underline decoration-gray-400 underline-offset-[6px] transition hover:text-gray-900 hover:decoration-gray-900 max-sm:hidden sm:px-3 sm:text-base"
            >
              See pricing
            </a>
            <Link
              href="/login"
              className="rounded-full bg-[#16171a] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#2a2b30] sm:px-7 sm:py-3 sm:text-base"
            >
              Sign in
            </Link>
          </div>
        </div>
      </header>

      {/* Hero — one screen tall in total, with the heading self-centred in the
          space above and the platform icons inside the same frame. */}
      <section className="relative flex min-h-screen flex-col text-gray-900">
        {/* The load sequence, not a scroll reveal — this is the first thing
            anyone sees. The headline grows from tiny, overshoots and bounces
            into place; the subtext and button pop in after it; the icons
            flash on one by one while the nav fades in (see HeroIconStrip and
            the .hero-* rules). */}
        <div className="flex flex-1 flex-col items-center justify-center px-4 pb-4 pt-24 text-center sm:px-6">
          {/* nowrap keeps "Our ad engine." on one line while the hidden
              card expands on hover */}
          {/* 3.15rem is the ceiling for the wanted mobile shape — "Your
              personal / brand." over two lines, "Our ad engine." on one —
              measured against a 375px screen with this hero's px-4. */}
          <h1 className="hero-title mx-auto max-w-6xl text-[3.15rem] font-light leading-[0.95] tracking-[-0.05em] text-gray-900 sm:text-7xl lg:text-8xl">
            Your personal brand.
            <br />
            <span className="lg:whitespace-nowrap">
              Our <HeroAdWord /> engine.
            </span>
          </h1>
          <p className="hero-sub mx-auto mt-6 max-w-2xl text-base font-light text-gray-600 sm:mt-8 sm:text-xl">
            We build and run paid social campaigns for Experts Group agents
            — you track every lead from first click to your CRM, all in one
            clean dashboard.
          </p>
          <div className="hero-cta mt-12 flex items-center justify-center gap-4">
            <Link
              href="/signup"
              className="btn-hero-glass px-10 py-4 text-base font-medium"
            >
              Choose your package
            </Link>
          </div>
        </div>
        {/* Social platforms strip — right across the foot of the hero. */}
        <div className="relative z-10 mx-auto w-full max-w-6xl px-8 pb-12 sm:px-12">
          <HeroIconStrip />
        </div>
      </section>

      {/* Second screen — charcoal rounded panel with breathing room above
          and below: bold copy left, photo + infographic right, physics icons
          landing at the bottom */}
      {/* Mobile: tighter above and below — the hero already ends in a band
          of icons, and the proof section pulls up to meet this one. */}
      <section id="built" className="px-4 pb-12 pt-10 sm:px-14 sm:py-28">
        {/* PanelReveal is a plain (untransformed) wrapper; the parallax
            transform lives on the glass panel itself. This matters: a
            transformed ANCESTOR establishes a backdrop root that blanks the
            panel's backdrop-filter — so the frost must sit on the same element
            that carries the transform, not a parent. */}
        <PanelReveal>
        {/* No overflow clipping: the photo and stat card throw real drop
            shadows that need to spill past the section edge onto the next
            one, or the section reads as a cut-out. */}
        {/* The 64vh floor is a desktop measure — on a phone it just left a
            band of dead space under the CTA. */}
        <div className="relative flex flex-col rounded-[2.5rem] sm:min-h-[64vh]">
          {/* Wide column gap on desktop: the infographic card hangs off the
              photo's left edge, so a tight gap put it right up against the
              copy. Columns are deliberately uneven — the photo takes the
              larger share so this doesn't read as a symmetrical two-up. */}
          {/* MOBILE IS ONE CARD. Heading, promise, button and photo all live
              inside a single brand-coloured panel with the photo bleeding to
              its bottom and side edges — the panel encapsulates the section
              rather than sitting next to it.

              The grid IS the panel rather than being wrapped in one: it
              already contains exactly the copy and the photo, so an extra
              wrapper would be a box around a box. Padding and gap go to zero
              so the photo can reach the panel's edges, and the copy gets its
              own padding back.

              Colour is var(--group) at FULL strength — the brand colour
              match-for-match, per James — so it's whatever the brand-colour
              picker is set to. That's why every piece of type in here is
              white: on a deep brand colour, the gray-900 the rest of the page
              uses would be unreadable. Worth knowing if a much lighter brand
              colour is ever picked.

              DESKTOP IS UNTOUCHED — every class here is max-sm:. */}
          <div
              className="mx-auto grid w-full max-w-7xl flex-1 items-center gap-10 px-8 py-12 max-sm:gap-0 max-sm:overflow-hidden max-sm:rounded-[2rem] max-sm:bg-[var(--group)] max-sm:px-0 max-sm:py-0 sm:px-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-24"
            >
            {/* Same rhythm as the hero: the heading grows in and bounces,
                the subtext drops in line by line, the button fades last. */}
            <MobileParallax className="max-sm:px-6 max-sm:pt-10">
              <h2 className="mp-lead p-title max-w-lg text-4xl font-semibold leading-[1.05] tracking-tight text-gray-900 max-sm:max-w-none max-sm:text-[2rem] max-sm:text-white sm:text-5xl">
                What is Launch Pad?
              </h2>
              {/* Mobile reads as a statement, not body copy: bigger, darker,
                  with the two phrases that carry the whole proposition picked
                  out. The sections below are card stacks, so this one earns
                  its difference through type rather than another card. */}
              {/* Short on mobile: the photo now carries the bottom of the
                  block, so the copy has to earn its space in one breath. */}
              <p
                className="mp-follow p-sub mt-4 max-w-xs text-[1.05rem] leading-[1.45] text-white/85 sm:hidden"
                style={{ "--d": "0s" } as React.CSSProperties}
              >
                We build and run your ads. Every lead lands in{" "}
                <span className="font-semibold text-white">one dashboard</span>
                , phone number ready to call.
              </p>
              <p
                className="p-sub mt-5 max-w-md text-lg leading-relaxed text-gray-600 max-sm:hidden"
                style={{ "--d": "0s" } as React.CSSProperties}
              >
                We build your ads, run them on the platforms your local audience
                actually uses, and drop every lead that comes back into one
                dashboard — with the phone number already there, ready to call.
              </p>
              {/* Mobile CTA sits ABOVE the photo, so the block reads
                  heading → promise → action, and the image closes it. */}
              <div className="p-cta mt-6 sm:hidden">
                <Link
                  href="/signup"
                  className="inline-flex items-center gap-3 rounded-full bg-white py-1.5 pl-6 pr-1.5 text-sm font-semibold text-gray-900 shadow-sm transition active:scale-[0.98]"
                >
                  Start your campaign
                  {/* The arrow badge carries the brand colour, so the button
                      still reads as ours rather than a generic white pill. */}
                  <span
                    aria-hidden
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--group)] text-white"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M7 17 17 7M9 7h8v8" />
                    </svg>
                  </span>
                </Link>
              </div>
              {/* Second paragraph is desktop-only — on a phone one paragraph
                  says it, and the image deserves the room. */}
              <p
                className="p-sub mt-4 max-w-md text-lg leading-relaxed text-gray-600 max-sm:hidden"
                style={{ "--d": "0.14s" } as React.CSSProperties}
              >
                You do the part you&apos;re good at: talking to people. We do
                the part that involves arguing with Meta&apos;s ad manager at
                two in the morning.
              </p>
              {/* Desktop CTA — on mobile it moves below the image (see the
                  sm:hidden copy after the image column). */}
              <div className="p-cta mt-8 max-sm:hidden">
                <Link
                  href="/signup"
                  className="btn-group inline-block rounded-full px-9 py-4 text-base font-semibold"
                >
                  Start your campaign
                </Link>
              </div>
            </MobileParallax>
            {/* Mobile: the photo fills the bottom of the panel, edge to edge
                and flush with its bottom — the panel's overflow-hidden does
                the corner rounding, so the frame needs none of its own. */}
            <div className="relative mx-auto w-full max-w-md max-sm:mx-5 max-sm:mb-20 max-sm:mt-7 max-sm:w-auto max-sm:max-w-none lg:mr-0 lg:max-w-xl">
              {/* Same photograph at every size now — the hand holding the
                  phone — so the <source media> forking that existed for the
                  mobile-only cut-out is gone. (Kept in history: display:none
                  never stops a browser downloading an image, so two <img>s
                  was never an option.)

                  Mobile matches the reference layout: the photo floats inset
                  inside the brand panel, a small terminal-style caption sits
                  on it, and the leads graph card breaks its bottom-left
                  corner. The caption shares p-stat so both annotations pop
                  together after the photo lands. */}
              <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl sm:shadow-2xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/images/paid-ads.jpg"
                  alt="An agent's next client, mid-scroll"
                  className="p-image block aspect-[4/5] w-full object-cover"
                />
                <p className="p-stat absolute left-4 top-4 max-w-[230px] rounded-lg bg-gray-950/55 px-3 py-2 font-mono text-[9px] font-medium uppercase leading-relaxed tracking-[0.14em] text-white backdrop-blur-sm sm:hidden">
                  Every lead from your ads — name, number, straight to your
                  phone
                </p>
              </div>
              {/* Infographic overlay — expands after the image, then counts */}
              <LeadsStat className="p-stat" startDelay={1500} />
            </div>
          </div>

        </div>
        </PanelReveal>
      </section>

      {/* Proof + How it works — one continuous, light-grey passage.
          Desktop runs them as a single pinned presentation (ProofHowScene):
          the proof reveals beat by beat, flies off the top, and the phone
          rises into the second slide — the page feels stationary while the
          content moves. Mobile gets the same content as plain sections. */}
      <div className="relative">
        <div className="lg:hidden">
          <section id="proof" className="py-24 max-sm:pt-10">
            <Reveal>
              <TrialProof />
            </Reveal>
          </section>
          <section className="px-6 pb-24 pt-6">
            <Reveal>
              <HowItWorksPhone />
            </Reveal>
          </section>
        </div>
        <div className="hidden lg:block">
          <ProofHowScene />
        </div>

        {/* "Everything plugs into one place" — a plain section now; the page
            just scrolls into it. (The expanding-circle entrance moved down
            to the pricing section.) */}
        {/* Hidden on mobile — with the how-it-works cards right above it,
            this read as a third explainer in a row on a phone. */}
        <section className="relative z-20 px-6 pb-32 pt-28 max-sm:hidden sm:pt-36">
          <Reveal>
            <PlugIntoStack />
          </Reveal>
        </section>
      </div>

      {/* Pain points — the empathy beat, deliberately the last thing before
          the price. No curve of its own: the section above it is already
          the page grey, so a second slab edge here would sit tone-on-tone
          and read as nothing. Replaced the mocked ad showcase, which was
          pretending to be real campaigns we don't have yet. */}
      {/* Explicit background, not transparent: the section above it is an
          opaque slab, so anything sitting behind the page (a bloom, the
          texture layer) shows through this one and not that one — which drew
          a hard line across the join. Same colour, both opaque, no seam. */}
      <section id="pain" className="relative z-30 bg-[#f4f4f5] py-28 max-sm:hidden">
        <PainPoints />
      </section>

      {/* Packages — the finale before the footer. Enters as a white
          near-circle that expands outwards as it rises (ExpandingSlab), with
          the heading and the pricing riding at different speeds. Full-screen,
          with the included list out in the open rather than folded away. */}
      <ExpandingSlab
        id="packages"
        className="pricing-slab relative z-30 min-h-screen px-6"
      >
        <div className="mx-auto max-w-6xl py-28">
          {/* par-slow / par-fast are ExpandingSlab's parallax hooks — kept on
              their own wrappers so they never fight Reveal's transitions. */}
          <div className="par-slow">
            <Reveal>
              <h2 className="text-center text-4xl font-semibold tracking-tight">
                Simple, transparent pricing. You are in control.
              </h2>
            </Reveal>
          </div>
          <div className="par-fast">

          {/* Fee on the left, packages on the right, with a real + between
              them — the whole pricing model is "one flat fee PLUS the spend
              you choose", and setting it out as a sum says that faster than
              two stacked blocks did. */}
          <div className="mt-16 grid items-center gap-8 lg:grid-cols-[minmax(0,15rem)_auto_minmax(0,1fr)] lg:gap-6">
            <Reveal>
              <div className="text-center lg:text-left">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                  Management
                </p>
                <p className="mt-3 text-5xl font-light tracking-[-0.04em]">
                  £{MANAGEMENT_FEE}
                </p>
                <p className="mt-1 text-sm text-gray-400">per month</p>
                <p className="mt-4 text-sm leading-relaxed text-gray-500">
                  Covers everything: campaign management, creative production,
                  monthly optimisation, your dashboard, lead nurture and
                  reporting.
                </p>
              </div>
            </Reveal>

            <Reveal>
              <p
                aria-hidden
                className="text-center text-6xl font-extralight leading-none text-gray-400 lg:text-7xl"
              >
                +
              </p>
            </Reveal>

            {/* items-center + a taller middle card: the popular one stands
                proud of the other two instead of three matching rectangles. */}
            <div className="grid gap-4 sm:grid-cols-3 sm:items-center">
            {PACKAGES.map((p, i) => (
              <Reveal key={p.id} delay={i * 120} className="h-full">
                <div
                  className={`lift-card relative flex h-full flex-col rounded-2xl border bg-white p-5 ${
                    p.highlighted
                      ? "border-gray-900 shadow-lg sm:py-9"
                      : "border-gray-200"
                  }`}
                >
                  {p.highlighted && (
                    <span className="btn-group absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-medium">
                      Most popular
                    </span>
                  )}
                  <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                    {p.name}
                  </h3>
                  {/* Headline is the daily figure — that's the number the
                      agent actually chooses. Monthly sits under it. */}
                  <div className="mt-3 flex items-baseline gap-1.5">
                    <span className="text-3xl font-semibold tracking-tight">
                      £{p.dailyAdSpend}
                    </span>
                    <span className="text-xs text-gray-400">per day</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-400">
                    approx. £{p.adSpend}/month ad spend
                  </p>

                  <div className="mt-4 border-t border-gray-200 pt-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                      Best for
                    </p>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-gray-600">
                      {p.bestFor}
                    </p>
                  </div>

                  {/* No per-card feature list: every package includes exactly
                      the same things, so it runs once under all three. */}
                  <p className="mt-4 flex-1 text-[13px] text-gray-500">
                    Total{" "}
                    <span className="font-semibold text-gray-900">
                      approx. £{p.price}/month
                    </span>
                  </p>
                  <Link
                    href={`/signup?package=${p.id}`}
                    // The outline buttons fill with the brand red on hover —
                    // a deliberate choice kept from the dark theme, where the
                    // old bg-gray-50 hover went white-on-white.
                    className={`mt-4 rounded-xl py-2.5 text-center text-[13px] font-medium transition ${
                      p.highlighted
                        ? "btn-group"
                        : "btn-press border border-gray-200 text-gray-900 hover:border-transparent hover:bg-[var(--group)] hover:text-white"
                    }`}
                  >
                    Choose {p.name}
                  </Link>
                </div>
              </Reveal>
            ))}
            </div>
          </div>

          {/* The included list, out in the open — the same six things on
              every package, shown rather than folded behind a toggle. */}
          <Reveal>
            <div className="mx-auto mt-20 max-w-4xl">
              <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                What&apos;s included in every package
              </p>
              <div className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
                {INCLUDED_IN_EVERY_PACKAGE.map((f) => (
                  <div key={f.title}>
                    <div className="flex items-center gap-2.5">
                      <svg
                        className="h-4 w-4 shrink-0 text-[var(--group)]"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 111.4-1.4L8 12.6l7.3-7.3a1 1 0 011.4 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <p className="font-semibold text-gray-900">{f.title}</p>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-gray-600">
                      {f.detail}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>

          {/* Just the commitment terms now — the founding agent offer is out. */}
          <Reveal>
            <div className="mt-14 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
              {PACKAGE_TERMS.map((t) => (
                <span key={t} className="text-sm text-gray-500">
                  {t}
                </span>
              ))}
            </div>
          </Reveal>
          </div>
        </div>
      </ExpandingSlab>

      {/* Footer — inverted against the white pricing finale above it: white
          background, light grey card, grey wording. The page ends on a giant
          faint wordmark that fades out and is cut off by the bottom edge.
          "Launch Pad" on desktop; "TEG" on mobile, where the long name
          wouldn't survive the narrow screen. */}
      <footer className="relative z-30 overflow-hidden bg-[#ffffff] px-4 pt-10 sm:px-8">
        <div className="relative mx-auto max-w-6xl rounded-[2rem] bg-[#f4f4f5] p-8 shadow-[0_18px_44px_-30px_rgba(17,24,39,0.14)] sm:p-12">
          <BackToTop className="absolute right-6 top-6 sm:right-10 sm:top-10" />
          <div className="flex flex-col justify-between gap-10 sm:flex-row sm:gap-14">
            <div className="max-w-xs">
              {/* The group's own logo, per the 2026 brand guidelines. Purple
                  logogram + black wordmark is the specified version over a
                  light background; the lockup is fixed, so it ships as one
                  image rather than being rebuilt from type. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/teg-logo.webp"
                alt="The Experts Group"
                className="h-14 w-auto"
              />
              <p className="mt-3 text-sm leading-relaxed text-gray-500">
                Paid ads, built and run for Experts Group agents — tracked
                from first click to your CRM.
              </p>
              {/* Socials — in the brand colour, so they follow whatever the
                  colour picker is auditioning. hrefs are placeholders until
                  marketing supplies the group's real profile URLs. */}
              <div className="mt-5 flex items-center gap-4 text-[var(--group)]">
                {["Meta / Facebook", "Instagram", "LinkedIn", "YouTube", "TikTok"].map(
                  (name) => {
                    const icon = ICONS.find((i) => i.name === name)!;
                    return (
                      <a
                        key={name}
                        href="#"
                        aria-label={name}
                        className="transition hover:-translate-y-0.5 hover:text-[var(--group-deep)]"
                      >
                        <SocialIcon icon={icon} className="h-5 w-5" />
                      </a>
                    );
                  }
                )}
              </div>
            </div>
            <div className="flex gap-12 pr-0 sm:gap-16 sm:pr-20">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                  Portal
                </p>
                <ul className="mt-4 space-y-2.5 text-sm text-gray-600">
                  <li>
                    <Link href="/login" className="hover:text-gray-900">
                      Sign in
                    </Link>
                  </li>
                  <li>
                    <Link href="/signup" className="hover:text-gray-900">
                      Create your account
                    </Link>
                  </li>
                  <li>
                    <a href="#packages" className="hover:text-gray-900">
                      Packages
                    </a>
                  </li>
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                  Contact
                </p>
                <ul className="mt-4 space-y-2.5 text-sm text-gray-600">
                  <li>
                    <a
                      href="mailto:leads@theexpertsgroup.co.uk"
                      className="hover:text-gray-900"
                    >
                      leads@theexpertsgroup.co.uk
                    </a>
                  </li>
                  <li>
                    <Link href="/admin" className="hover:text-gray-900">
                      Admin
                    </Link>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Legal row */}
          <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-gray-200 pt-6 text-xs text-gray-400 sm:flex-row">
            <span>© {new Date().getFullYear()} The Experts Group</span>
            <div className="flex gap-6">
              <Link href="/privacy" className="transition hover:text-gray-900">
                Privacy
              </Link>
              <Link href="/terms" className="transition hover:text-gray-900">
                Terms
              </Link>
            </div>
          </div>
        </div>

        {/* The giant wordmark. The negative bottom margin pushes the base of
            the letters past the footer's edge, and overflow-hidden on the
            footer does the cropping. */}
        <p
          aria-hidden
          className="footer-wordmark hidden text-[15vw] sm:block sm:-mb-[0.16em] sm:mt-10"
        >
          Launch Pad
        </p>
        <p
          aria-hidden
          className="footer-wordmark -mb-[0.16em] mt-10 text-[36vw] sm:hidden"
        >
          TEG
        </p>
      </footer>
    </main>
  );
}
