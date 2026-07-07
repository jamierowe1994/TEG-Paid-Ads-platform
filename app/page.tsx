import Link from "next/link";
import { BRANDS } from "@/lib/brands";
import { PACKAGES } from "@/lib/packages";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-white">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-gray-100 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-900 text-sm font-bold text-white">
              E
            </div>
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
              className="rounded-lg bg-gray-900 px-4 py-2 font-medium text-white transition hover:bg-gray-700"
            >
              Get started
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pb-20 pt-24 text-center">
        <p className="mb-4 text-sm font-medium uppercase tracking-widest text-gray-400">
          Paid ads, done for you
        </p>
        <h1 className="mx-auto max-w-3xl text-5xl font-semibold tracking-tight text-gray-900 sm:text-6xl">
          Your personal brand.
          <br />
          <span className="text-gray-400">Our ad engine.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-gray-500">
          We build and run Instagram and Facebook campaigns for Experts Group
          agents — you track every lead from first click to your CRM, all in
          one clean dashboard.
        </p>
        <div className="mt-10 flex items-center justify-center gap-4">
          <Link
            href="/signup"
            className="rounded-xl bg-gray-900 px-8 py-3.5 text-sm font-medium text-white transition hover:bg-gray-700"
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
      </section>

      {/* Brands strip */}
      <section className="border-y border-gray-100 bg-gray-50/60">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <p className="mb-6 text-center text-xs font-medium uppercase tracking-widest text-gray-400">
            One group, five businesses
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
            {BRANDS.map((b) => (
              <div key={b.id} className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: b.accent }}
                />
                <span className="text-sm font-medium text-gray-600">
                  {b.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-6xl px-6 py-24">
        <h2 className="text-center text-3xl font-semibold tracking-tight">
          How it works
        </h2>
        <div className="mt-14 grid gap-10 sm:grid-cols-3">
          {[
            {
              n: "1",
              title: "Pick a package",
              body: "Choose the level that fits your goals and pay securely online. Sign up with your work email and we route you straight to your business's portal.",
            },
            {
              n: "2",
              title: "We build your ads",
              body: "Tell us your platforms and goals. Our team prepares your creatives and launches your campaigns — you watch it all come together in your dashboard.",
            },
            {
              n: "3",
              title: "Track every lead",
              body: "Leads land in your portal. Work them through your funnel, convert them, and push them straight into your CRM with one click.",
            },
          ].map((s) => (
            <div key={s.n} className="text-center">
              <div className="mx-auto mb-5 flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 text-sm font-semibold text-gray-900">
                {s.n}
              </div>
              <h3 className="mb-2 font-semibold">{s.title}</h3>
              <p className="text-sm leading-relaxed text-gray-500">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Packages */}
      <section id="packages" className="border-t border-gray-100 bg-gray-50/60">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <h2 className="text-center text-3xl font-semibold tracking-tight">
            Simple packages, no surprises
          </h2>
          <p className="mx-auto mt-3 max-w-md text-center text-gray-500">
            Every package includes your own lead-tracking dashboard and access
            to the Experts Group referral network.
          </p>
          <div className="mt-14 grid gap-6 lg:grid-cols-3">
            {PACKAGES.map((p) => (
              <div
                key={p.id}
                className={`relative flex flex-col rounded-2xl border bg-white p-8 ${
                  p.highlighted
                    ? "border-gray-900 shadow-lg"
                    : "border-gray-200"
                }`}
              >
                {p.highlighted && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gray-900 px-3 py-1 text-xs font-medium text-white">
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
                        className="mt-0.5 h-4 w-4 shrink-0 text-gray-900"
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
                      ? "bg-gray-900 text-white hover:bg-gray-700"
                      : "border border-gray-200 text-gray-900 hover:bg-gray-50"
                  }`}
                >
                  Choose {p.name}
                </Link>
              </div>
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
