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
import PanelReveal from "@/components/PanelReveal";
import SmoothScroll from "@/components/SmoothScroll";
import StandaloneGuard from "@/components/StandaloneGuard";
import PlugIntoStack from "@/components/PlugIntoStack";
import HowItWorksPhone from "@/components/HowItWorksPhone";
import TrialProof from "@/components/TrialProof";
import PainPoints from "@/components/PainPoints";

// The site's backdrop — a dark charcoal that runs the length of the page.
// Kept as a constant because the rocket's window is punched out in it.
const HERO_BG = "#1b1c20";

// The Launch Pad rocket, matching the installed app icon. White on the dark
// hero; the porthole is punched in the backdrop colour rather than filled white.
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
    // overflow-x-clip is scoped to mobile now. An ancestor with any non-visible
    // overflow becomes the sticky containing block, and since <main> doesn't
    // scroll, `position: sticky` on the panels below had nothing to stick to —
    // they just scrolled normally. Desktop gets the stacking effect; mobile
    // keeps the sideways-drift guard (which is only a mobile problem anyway,
    // and <html> already carries overflow-x: hidden under 1024px).
    <main className="landing-dark relative min-h-screen max-lg:overflow-x-clip">
      <StandaloneGuard />
      <SmoothScroll />
      {/* The charcoal backdrop, fixed so it runs the whole length of the page. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-20"
        style={{ backgroundColor: HERO_BG }}
      />
      {/* Nav — just the Launch Pad mark, then the pack, pricing and Sign in.
          Sits over the dark hero, so everything here is white. */}
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

      {/* Hero — one screen tall in total, with the heading self-centred in the
          space above and the platform icons inside the same frame. */}
      <section className="relative flex min-h-screen flex-col text-white">
        <div className="flex flex-1 flex-col items-center justify-center px-6 pb-4 pt-24 text-center">
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
        {/* Social platforms strip — right across the foot of the hero. */}
        <div className="relative z-10 mx-auto w-full max-w-6xl px-8 pb-12 sm:px-12">
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
          {/* Wide column gap on desktop: the infographic card hangs off the
              photo's left edge, so a tight gap put it right up against the
              copy. Columns are deliberately uneven — the photo takes the
              larger share so this doesn't read as a symmetrical two-up. */}
          <div className="mx-auto grid w-full max-w-7xl flex-1 items-center gap-10 px-8 py-12 sm:px-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-24">
            <div className="p-words">
              <h2 className="max-w-lg text-4xl font-semibold leading-[1.05] tracking-tight text-gray-900 sm:text-5xl">
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
                  className="btn-group inline-block rounded-full px-9 py-4 text-base font-semibold"
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

      {/* Proof — the real three-month trial. Deliberately between "What is
          Launch Pad?" and "How it works": say what it is, earn the trust, then
          explain the mechanics. */}
      <section id="proof" className="pb-28 pt-24">
        <Reveal>
          <TrialProof />
        </Reveal>
      </section>

      {/* How it works — back on the page's own charcoal, and given real room.
          Its two columns drift against each other as you scroll (see Drift),
          which is why this sits OUTSIDE the sticky stack below: a transform
          on an ancestor becomes the containing block for sticky descendants
          and would break the stacking. */}
      <section id="how" className="mx-auto max-w-6xl px-6 py-32 sm:py-40">
        <Reveal>
          <HowItWorksPhone />
        </Reveal>
      </section>

      {/* ── The stack ─────────────────────────────────────────────────────
          Two panels that scroll over one another: the light one pins to the
          top of the viewport while the pain points slide up over it, which
          is what takes the page back to charcoal.

          It has to be `sticky top`, not `bottom`: bottom-anchored sticky only
          engages when scrolling UP, so scrolling down just carried the panel
          off-screen and nothing pinned at all.

          They are siblings in one relative container — that shared containing
          block is what gives the sticky layer something to travel against.
          Splitting them into separate wrappers kills the effect, because a
          layer can't stick past its own parent. */}
      <div className="relative">
        {/* Everything plugs into one place — the page's one light panel. */}
        <div className="light-panel sticky top-0 z-0">
          <section className="px-6 pb-40 pt-28 sm:pt-36">
            <Reveal>
              <PlugIntoStack />
            </Reveal>
          </section>
        </div>

        {/* Pain points — curves up over the light panel and returns the page
            to charcoal. */}
        <section
          id="pain"
          className="dark-slab relative z-10 pb-28 pt-32 sm:pt-40"
        >
          <PainPoints />
        </section>
      </div>

      {/* Packages */}
      <section id="packages">
        <div className="mx-auto max-w-6xl px-6 py-28">
          <Reveal>
            <h2 className="text-center text-4xl font-semibold tracking-tight">
              Simple, transparent pricing. You are in control.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-center text-gray-500">
              The only difference between packages is how hard you want to
              push. Everything else is identical.
            </p>
          </Reveal>

          {/* The flat fee first — it's the same on all three, so it belongs
              above the tiers rather than repeated inside each one. */}
          <Reveal>
            <div className="mx-auto mt-14 max-w-2xl text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                Monthly management fee
              </p>
              <p className="mt-4 text-5xl font-light tracking-[-0.04em]">
                £{MANAGEMENT_FEE}
                <span className="ml-2 align-middle text-base text-gray-400">
                  per month
                </span>
              </p>
              <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-gray-500">
                Covers everything: campaign management, creative production,
                monthly optimisation, your dashboard, lead nurture and
                reporting.
              </p>
            </div>
          </Reveal>

          <Reveal>
            <p className="mt-16 text-center text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
              Choose your daily ad spend
            </p>
          </Reveal>

          {/* items-center + a taller middle card: the popular one stands
              proud of the other two instead of three matching rectangles. */}
          <div className="mt-8 grid gap-6 lg:grid-cols-3 lg:items-center">
            {PACKAGES.map((p, i) => (
              <Reveal key={p.id} delay={i * 120} className="h-full">
                <div
                  className={`lift-card relative flex h-full flex-col rounded-2xl border bg-white p-8 ${
                    p.highlighted
                      ? "border-gray-900 shadow-lg lg:py-14"
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
                  <div className="mt-4 flex items-baseline gap-1.5">
                    <span className="text-4xl font-semibold tracking-tight">
                      £{p.dailyAdSpend}
                    </span>
                    <span className="text-sm text-gray-400">per day</span>
                  </div>
                  <p className="mt-1.5 text-sm text-gray-400">
                    approx. £{p.adSpend}/month ad spend
                  </p>
                  <p className="mt-5 text-sm leading-relaxed text-gray-600">
                    {p.tagline}
                  </p>

                  <div className="mt-6 border-t border-gray-200 pt-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                      Best for
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-gray-600">
                      {p.bestFor}
                    </p>
                  </div>

                  {/* No per-card feature list: every package includes exactly
                      the same things, so it runs once under all three. */}
                  <p className="mt-6 flex-1 text-sm text-gray-500">
                    £{p.managementFee} management + £{p.adSpend} ad spend ={" "}
                    <span className="font-semibold text-gray-900">
                      approx. £{p.price}/month
                    </span>
                  </p>
                  <Link
                    href={`/signup?package=${p.id}`}
                    // The outline buttons used to hover to bg-gray-50. On the
                    // dark page that hover variant isn't remapped, so they
                    // went white-on-white. They fill with the brand red now.
                    className={`mt-5 rounded-xl py-3 text-center text-sm font-medium transition ${
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

          {/* The full included list, folded away behind a button — it's the
              same six things on every package, so it was adding a screen of
              height to say something the cards already imply. <details> so
              it works without JS and stays in the page for search. */}
          <Reveal>
            <details className="group mx-auto mt-14 max-w-4xl">
              <summary className="mx-auto flex w-fit cursor-pointer list-none items-center gap-2 rounded-full border border-gray-200 px-6 py-3 text-sm font-medium text-gray-900 transition hover:border-transparent hover:bg-[var(--group)] hover:text-white [&::-webkit-details-marker]:hidden">
                What&apos;s included in every package
                <svg
                  className="h-4 w-4 transition-transform duration-200 group-open:rotate-180"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 8l5 5 5-5" />
                </svg>
              </summary>
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
            </details>
          </Reveal>

          {/* Just the commitment terms now — the founding agent offer is out. */}
          <Reveal>
            <div className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
              {PACKAGE_TERMS.map((t) => (
                <span key={t} className="text-sm text-gray-500">
                  {t}
                </span>
              ))}
            </div>
          </Reveal>
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
