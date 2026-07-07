import Link from "next/link";
import { BRANDS, EXPERTS_GROUP } from "@/lib/brands";
import { PACKAGES } from "@/lib/packages";
import BrandMark from "@/components/BrandMark";
import Reveal from "@/components/Reveal";
import HeroAdWord from "@/components/HeroAdWord";

export default function LandingPage() {
  return (
    <main className="min-h-screen overflow-x-clip bg-white">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-gray-100 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <BrandMark
              name={EXPERTS_GROUP.name}
              accent={EXPERTS_GROUP.accent}
              logo={EXPERTS_GROUP.logo}
              size={32}
            />
            <span className="text-sm font-semibold tracking-tight">
              The Experts Group
            </span>
          </div>
          <nav className="flex items-center gap-6 text-sm text-gray-500">
            <a href="#packages" className="hidden hover:text-gray-900 sm:block">
              Packages
            </a>
            <a href="#how" className="hidden hover:text-gray-900 sm:block">
              How it works
            </a>
            <Link href="/login" className="hover:text-gray-900">
              Sign in
            </Link>
            <Link
              href="/signup"
              className="btn-group rounded-lg px-4 py-2 font-medium transition"
            >
              Get started
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pb-20 pt-24 text-center">
        <Reveal>
          <p className="mb-4 text-sm font-medium uppercase tracking-widest text-gray-400">
            Paid ads, done for you
          </p>
          {/* max-w-4xl + nowrap give the expanded card room on desktop so
              "engine." never drops to a second line mid-hover */}
          <h1 className="mx-auto max-w-4xl text-5xl font-semibold tracking-tight text-gray-900 sm:text-6xl">
            Your personal brand.
            <br />
            <span className="text-gray-400 lg:whitespace-nowrap">
              Our <HeroAdWord /> engine.
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-gray-500">
            We build and run Instagram and Facebook campaigns for Experts
            Group agents — you track every lead from first click to your CRM,
            all in one clean dashboard.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Link
              href="/signup"
              className="btn-group rounded-xl px-8 py-3.5 text-sm font-medium transition"
            >
              Choose your package
            </Link>
            <Link
              href="/login"
              className="rounded-xl border border-gray-200 px-8 py-3.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              Sign in
            </Link>
          </div>
        </Reveal>
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

      {/* Footer */}
      <footer className="border-t border-gray-100">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-10 text-sm text-gray-400 sm:flex-row">
          <span>© {new Date().getFullYear()} The Experts Group</span>
          <div className="flex gap-6">
            <Link href="/admin" className="hover:text-gray-600">
              Admin
            </Link>
            <span>Privacy</span>
            <span>Terms</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
