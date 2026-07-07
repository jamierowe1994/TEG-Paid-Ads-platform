import Link from "next/link";
import { BRANDS, EXPERTS_GROUP } from "@/lib/brands";
import { PACKAGES } from "@/lib/packages";
import BrandMark from "@/components/BrandMark";
import Reveal from "@/components/Reveal";
import HeroAdWord from "@/components/HeroAdWord";
import PhysicsIcons from "@/components/PhysicsIcons";
import HeroIconStrip from "@/components/HeroIconStrip";

export default function LandingPage() {
  return (
    <main className="min-h-screen overflow-x-clip bg-white">
      {/* Nav — big pin + three-line group name, and a big Sign in */}
      <header className="absolute inset-x-0 top-0 z-40">
        <div className="mx-auto flex h-28 max-w-7xl items-center justify-between px-6 sm:px-10">
          <Link
            href="/"
            aria-label="The Experts Group"
            className="flex items-center gap-3"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand-logos/group-black.png"
              alt=""
              className="h-14 w-auto sm:h-[4.5rem]"
            />
            <span className="text-sm font-semibold uppercase leading-[1.35] tracking-wide text-gray-900 sm:text-base">
              The
              <br />
              Experts
              <br />
              Group
            </span>
          </Link>
          <Link
            href="/login"
            className="btn-group rounded-full px-7 py-3 text-base font-medium transition sm:px-9 sm:py-3.5"
          >
            Sign in
          </Link>
        </div>
      </header>

      {/* Hero — full screen, icons along the bottom */}
      <section className="flex min-h-screen flex-col px-6 pt-28">
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <Reveal>
            <p className="mb-5 text-sm font-medium uppercase tracking-widest text-gray-400">
              Paid ads, done for you
            </p>
            {/* nowrap keeps "Our ad engine." on one line while the hidden
                card expands on hover */}
            <h1 className="mx-auto max-w-5xl text-5xl font-semibold tracking-tight text-gray-900 sm:text-6xl lg:text-7xl">
              Your personal brand.
              <br />
              <span className="lg:whitespace-nowrap">
                Our <HeroAdWord /> engine.
              </span>
            </h1>
            <p className="mx-auto mt-8 max-w-2xl text-lg text-gray-500 sm:text-xl">
              We build and run paid social campaigns for Experts Group agents
              — you track every lead from first click to your CRM, all in one
              clean dashboard.
            </p>
            <div className="mt-12 flex items-center justify-center gap-4">
              <Link
                href="/signup"
                className="btn-group rounded-xl px-9 py-4 text-base font-medium transition"
              >
                Choose your package
              </Link>
            </div>
          </Reveal>
        </div>
        {/* Social platforms strip — falls into the next screen on scroll */}
        <div className="mx-auto w-full max-w-5xl pb-12 pt-8">
          <HeroIconStrip />
        </div>
      </section>

      {/* Second screen — red rounded panel: bold copy left, photo +
          infographic right, physics icons landing at the bottom */}
      <section className="flex min-h-screen flex-col p-3">
        <div className="relative flex flex-1 flex-col overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-[#E31F36] to-[#AE1226]">
          <div className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-14 px-8 py-20 sm:px-12 lg:grid-cols-2">
            <Reveal direction="left">
              <span className="inline-block rounded-full bg-white/15 px-4 py-1.5 text-sm font-medium text-white">
                Built for agents
              </span>
              <h2 className="mt-6 max-w-lg text-4xl font-semibold leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl">
                Paid ads that stop the scroll.
              </h2>
              <p className="mt-6 max-w-md text-lg leading-relaxed text-white/75">
                Seven businesses, one engine. We run your campaigns on the
                platforms that matter, branded as you — so your patch sees
                your face, not a faceless portal.
              </p>
              <div className="mt-10 flex flex-wrap items-center gap-4">
                <Link
                  href="/signup"
                  className="rounded-xl bg-white px-8 py-4 text-base font-semibold text-gray-900 transition hover:bg-gray-100"
                >
                  Start your campaign
                </Link>
                <a
                  href="#packages"
                  className="rounded-xl border border-white/30 px-8 py-4 text-base font-medium text-white transition hover:bg-white/10"
                >
                  See the packages
                </a>
              </div>
            </Reveal>
            <Reveal direction="right" delay={120}>
              <div className="relative mx-auto max-w-md lg:mr-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/images/paid-ads.jpg"
                  alt="An agent's next client, mid-scroll"
                  className="aspect-[4/5] w-full rounded-3xl object-cover"
                />
                {/* Infographic overlay */}
                <div className="absolute -left-4 bottom-12 w-52 rounded-2xl bg-white p-5 shadow-2xl sm:-left-8">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                    Leads this month
                  </p>
                  <p className="mt-1 text-3xl font-semibold text-[#E31F36]">
                    ↑ 41%
                  </p>
                  <div className="mt-3 flex items-end gap-2">
                    <div className="h-9 flex-1 rounded-md bg-red-100" />
                    <div className="h-14 flex-1 rounded-md bg-[#E31F36]" />
                  </div>
                  <p className="mt-2 text-[10px] text-gray-400">
                    vs last month
                  </p>
                </div>
              </div>
            </Reveal>
          </div>
          {/* Landing zone so settled icons don't sit on the content */}
          <div className="h-28" />
          {/* The hero's icons fall in here, turn to colour and bounce */}
          <PhysicsIcons />
        </div>
      </section>

      {/* Brands strip */}
      <section className="border-y border-gray-100">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <Reveal>
            <p className="mb-7 text-center text-xs font-medium uppercase tracking-widest text-gray-400">
              One group, seven businesses
            </p>
            <div className="flex flex-wrap items-center justify-center gap-x-9 gap-y-5">
              {BRANDS.map((b) => (
                <div key={b.id} className="flex items-center gap-2">
                  <BrandMark
                    name={b.name}
                    accent={b.accent}
                    logo={b.logo}
                    size={22}
                    rounded="rounded-none"
                  />
                  <span className="text-sm font-medium text-gray-600">
                    {b.name}
                  </span>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* How it works — steps left, mock dashboard right */}
      <section id="how" className="mx-auto max-w-6xl px-6 py-28">
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
                        <span>In REP</span>
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
                              Push to REP →
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
      </section>

      {/* Showcase — mocked ad creatives until real campaign shots arrive.
          TODO(showcase): swap mocks for real ads + add the filter-by-brand
          chips once enough brands are live. */}
      <section className="border-t border-gray-100">
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
      </section>

      {/* Packages */}
      <section id="packages" className="border-t border-gray-100">
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
                        : "border border-gray-200 text-gray-900 hover:bg-gray-50"
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
                className="rounded-xl bg-white px-8 py-4 text-base font-semibold text-gray-900 transition hover:bg-gray-200"
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
