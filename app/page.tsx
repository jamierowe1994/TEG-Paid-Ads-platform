import Link from "next/link";
import { BRANDS, EXPERTS_GROUP } from "@/lib/brands";
import { PACKAGES } from "@/lib/packages";
import Reveal from "@/components/Reveal";
import HeroAdWord from "@/components/HeroAdWord";
import HeroIconStrip from "@/components/HeroIconStrip";
import LeadsStat from "@/components/LeadsStat";
import PanelReveal from "@/components/PanelReveal";
import SmoothScroll from "@/components/SmoothScroll";
import StandaloneGuard from "@/components/StandaloneGuard";
import Stars from "@/components/Stars";
import PlugIntoStack from "@/components/PlugIntoStack";
import HowItWorksPhone from "@/components/HowItWorksPhone";

// The hero's backdrop. Kept as a constant because the rocket's window is
// punched out in this exact colour.
const HERO_BG = "#08080a";

// The Launch Pad rocket, matching the installed app icon. White on the black
// hero; the porthole is punched in the hero colour rather than filled white.
function LaunchPadMark() {
  return (
    <svg
      viewBox="0 0 512 512"
      className="h-12 w-12 sm:h-14 sm:w-14"
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
    <main className="landing-dark relative min-h-screen overflow-x-clip">
      <StandaloneGuard />
      <SmoothScroll />
      {/* The black itself. Sits below the stars so they read against it. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-20"
        style={{ backgroundColor: HERO_BG }}
      />
      {/* Brand colour in the black. Painted BEFORE the stars so they sit in
          front of the gradient as well as behind it. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          backgroundImage:
            "radial-gradient(65% 55% at 12% 4%, rgba(227,31,54,0.30), rgba(227,31,54,0.10) 42%, transparent 70%)," +
            "radial-gradient(55% 50% at 92% 10%, rgba(43,97,147,0.28), rgba(43,97,147,0.09) 44%, transparent 70%)," +
            "radial-gradient(60% 55% at 82% 90%, rgba(227,31,54,0.24), rgba(227,31,54,0.08) 44%, transparent 72%)," +
            "radial-gradient(50% 45% at 6% 78%, rgba(43,97,147,0.22), rgba(43,97,147,0.07) 44%, transparent 72%)",
        }}
      />
      {/* Night sky — stars edge to edge, with an occasional shooting star. */}
      <Stars />

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
              className="px-2 py-2.5 text-sm font-medium text-white/80 underline decoration-white/35 underline-offset-[6px] transition hover:text-white hover:decoration-white sm:px-3 sm:text-base"
            >
              See pricing
            </a>
            <Link
              href="/login"
              className="rounded-full bg-[#ffffff] px-5 py-2.5 text-sm font-semibold text-[#0f1115] transition hover:bg-white/90 sm:px-7 sm:py-3 sm:text-base"
            >
              Sign in
            </Link>
          </div>
        </div>
      </header>

      {/* Hero — one screen tall in total, black, with the heading self-centred
          in the space above and the platform icons sitting inside the same
          frame rather than below the fold. */}
      <section className="relative flex min-h-screen flex-col text-white">
        <div className="flex flex-1 flex-col items-center justify-center px-6 pb-8 pt-28 text-center">
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
              {/* Understated: the fill is barely off the page's black — the
                  draw is the light travelling round the rim. */}
              <Link href="/signup" className="btn-rim px-10 py-4 text-base font-medium">
                <span className="btn-rim-edge" aria-hidden />
                <span className="relative z-[2]">Choose your package</span>
              </Link>
            </div>
          </Reveal>
        </div>
        {/* Social platforms strip — sits quietly at the foot of the hero. The
            generous bottom padding keeps it clear of the next section's panel,
            which parallaxes UP by ~190px and would otherwise clip it. */}
        <div className="relative z-10 mx-auto w-full max-w-5xl px-6 pb-32">
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
        <div className="relative flex min-h-[64vh] flex-col overflow-hidden rounded-[2.5rem]">
          <div className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-8 py-12 sm:px-12 lg:grid-cols-2">
            <div className="p-words">
              <span className="inline-block rounded-full bg-[#E31F36] px-4 py-1.5 text-sm font-medium text-white">
                Mission briefing
              </span>
              <h2 className="mt-5 max-w-lg text-4xl font-semibold leading-[1.05] tracking-tight text-gray-900 sm:text-5xl">
                What is Launch Pad?
              </h2>
              <p className="mt-5 max-w-md text-lg leading-relaxed text-gray-600">
                We build your ads, run them on the platforms your patch
                actually uses, and drop every lead that comes back into one
                dashboard — with the phone number already there, ready to call.
              </p>
              <p className="mt-4 max-w-md text-lg leading-relaxed text-gray-600">
                You do the part you&apos;re good at: talking to people. We do
                the part that involves arguing with Meta&apos;s ad manager at
                two in the morning.
              </p>
              <p className="mt-5 max-w-md text-sm leading-relaxed text-gray-400">
                Why all the space stuff? Because &ldquo;launching your patch
                into the stratosphere&rdquo; tested better than &ldquo;we run
                your Facebook ads&rdquo;. Both are true. Only one has a planet.
              </p>
              <div className="mt-8">
                <Link
                  href="/signup"
                  className="btn-group inline-block rounded-xl px-8 py-4 text-base font-semibold"
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

        </div>
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

      {/* How it works — the process shown through the app itself, with a tab
          for each way of earning. */}
      <section id="how" className="mx-auto max-w-6xl px-6 py-28">
        <Reveal>
          <HowItWorksPhone />
        </Reveal>
      </section>

      {/* Everything plugs into one place — sources in, Launch Pad in the
          middle, the systems you already use out the other side. */}
      <section className="px-6 py-28">
        <Reveal>
          <PlugIntoStack />
        </Reveal>
      </section>

      {/* Showcase — mocked ad creatives until real campaign shots arrive.
          TODO(showcase): swap mocks for real ads + add the filter-by-brand
          chips once enough brands are live. */}
      <section>
        <div>
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
        </div>
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
      {/* Footer — mission control at the edge of the planet. The horizon sits
          behind the content and the page ends on it. */}
      <footer className="relative overflow-hidden pt-16">
        <div className="horizon" aria-hidden>
          <div className="horizon-planet" />
        </div>
        <div className="relative z-10 px-8 pb-20 pt-4 text-white sm:px-14 sm:pb-24">
          <div className="mx-auto max-w-6xl">
            {/* Links — kept to one tight row (the per-brand list is gone, so
                the horizon isn't pushed miles down the page). */}
            {/* Padded down so this row and the legal line below land ON the
                planet, under the lit rim, rather than floating above it. */}
            <div className="flex flex-col justify-between gap-8 pt-[190px] sm:flex-row sm:gap-14 sm:pt-[205px]">
              <div className="max-w-xs">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/brand-logos/group-white.png"
                  alt="The Experts Group"
                  className="h-10 w-auto"
                />
                <p className="mt-4 text-sm text-white/50">
                  Paid ads, built and run for Experts Group agents — tracked
                  from first click to your CRM.
                </p>
              </div>
              <div className="flex gap-12 sm:gap-16">
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
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-white/40">
                    Contact
                  </p>
                  <ul className="mt-4 space-y-2.5 text-sm text-white/70">
                    <li>
                      <a
                        href="mailto:leads@theexpertsgroup.co.uk"
                        className="hover:text-white"
                      >
                        leads@theexpertsgroup.co.uk
                      </a>
                    </li>
                    <li>
                      <Link href="/admin" className="hover:text-white">
                        Admin
                      </Link>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Legal row */}
            <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-white/10 pt-6 text-xs text-white/40 sm:flex-row">
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
