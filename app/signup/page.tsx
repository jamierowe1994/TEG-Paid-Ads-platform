"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { BRANDS, brandForEmail, EXPERTS_GROUP, type Brand } from "@/lib/brands";
import { PACKAGES, packageById } from "@/lib/packages";
import BrandMark from "@/components/BrandMark";
import { signUp } from "@/lib/session";

// One-question-at-a-time signup. Order:
// name → email (brand auto-detect) → password → mobile → photo → platforms
// → goal → package → payment (Stripe placeholder) → create account → dashboard.

type StepId =
  | "name"
  | "email"
  | "brand"
  | "password"
  | "mobile"
  | "photo"
  | "platforms"
  | "goal"
  | "package"
  | "payment";

const GOALS = [
  "More valuations / appraisals",
  "Build my personal brand locally",
  "Generate a steady flow of leads",
  "Dominate my patch",
];

function SignupWizard() {
  const router = useRouter();
  const params = useSearchParams();

  const [step, setStep] = useState<StepId>("name");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [brand, setBrand] = useState<Brand | null>(null);
  const [password, setPassword] = useState("");
  const [mobile, setMobile] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [platforms, setPlatforms] = useState<("instagram" | "facebook")[]>([]);
  const [goal, setGoal] = useState("");
  const [packageId, setPackageId] = useState<string>(
    packageById(params.get("package"))?.id ?? ""
  );
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const steps: StepId[] = useMemo(
    () => [
      "name",
      "email",
      ...(brand ? [] : (["brand"] as StepId[])),
      "password",
      "mobile",
      "photo",
      "platforms",
      "goal",
      "package",
      "payment",
    ],
    [brand]
  );
  const stepIndex = steps.indexOf(step);
  const progress = ((stepIndex + 1) / steps.length) * 100;

  function go(next: StepId) {
    setError("");
    setStep(next);
  }

  function back() {
    if (stepIndex > 0) go(steps[stepIndex - 1]);
  }

  function submitEmail() {
    const trimmed = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(trimmed)) {
      setError("That doesn't look like an email address.");
      return;
    }
    const detected = brandForEmail(trimmed);
    setBrand(detected ?? null);
    // Known domain → set a password. Unknown → ask which business first.
    go(detected ? "password" : "brand");
  }

  function handlePhoto(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function completeSignup() {
    if (!brand || submitting) return;
    setSubmitting(true);
    setError("");
    const { error } = await signUp({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
      mobile: mobile.trim(),
      photo,
      brandId: brand.id,
      platforms,
      goal,
      packageId,
    });
    if (error) {
      setError(error);
      setSubmitting(false);
      // Send the user back to fix a duplicate email / weak password.
      if (/email/i.test(error)) go("email");
      else if (/password/i.test(error)) go("password");
      return;
    }
    router.push("/dashboard");
  }

  const inputClass =
    "w-full rounded-xl border border-gray-200 px-4 py-3.5 text-lg outline-none transition focus:border-gray-900 focus:ring-4 focus:ring-gray-100";
  const primaryBtn =
    "rounded-xl bg-gray-900 px-8 py-3 text-sm font-medium text-white transition hover:bg-gray-700 disabled:opacity-30 disabled:hover:bg-gray-900";

  return (
    <main className="flex min-h-screen flex-col bg-white">
      {/* Top bar with progress */}
      <header className="border-b border-gray-100">
        <div className="mx-auto flex h-16 max-w-2xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <BrandMark
              name={EXPERTS_GROUP.name}
              accent={EXPERTS_GROUP.accent}
              logo={EXPERTS_GROUP.logo}
              size={28}
            />
            <span className="text-sm font-semibold">The Experts Group</span>
          </Link>
          <span className="text-xs text-gray-400">
            Step {stepIndex + 1} of {steps.length}
          </span>
        </div>
        <div className="h-0.5 bg-gray-100">
          <div
            className="h-full bg-gray-900 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-6 py-16">
        {/* ---- Name ---- */}
        {step === "name" && (
          <div className="fade-up" key="name">
            <h1 className="text-3xl font-semibold tracking-tight">
              First things first — what's your name?
            </h1>
            <input
              autoFocus
              className={`${inputClass} mt-8`}
              placeholder="e.g. James Rowe"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) =>
                e.key === "Enter" && name.trim() && go("email")
              }
            />
            <div className="mt-8">
              <button
                className={primaryBtn}
                disabled={!name.trim()}
                onClick={() => go("email")}
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* ---- Email (brand detection) ---- */}
        {step === "email" && (
          <div className="fade-up" key="email">
            <h1 className="text-3xl font-semibold tracking-tight">
              What's your work email, {name.split(" ")[0]}?
            </h1>
            <p className="mt-3 text-gray-500">
              We use your email domain to route you to the right business
              portal.
            </p>
            <input
              autoFocus
              type="email"
              className={`${inputClass} mt-8`}
              placeholder="you@thepropertyexperts.co.uk"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && email && submitEmail()}
            />
            {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
            <div className="mt-8 flex gap-3">
              <button
                className="rounded-xl border border-gray-200 px-6 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50"
                onClick={back}
              >
                Back
              </button>
              <button
                className={primaryBtn}
                disabled={!email}
                onClick={submitEmail}
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* ---- Brand picker (unknown domain fallback) ---- */}
        {step === "brand" && (
          <div className="fade-up" key="brand">
            <h1 className="text-3xl font-semibold tracking-tight">
              Which business are you with?
            </h1>
            <p className="mt-3 text-gray-500">
              We didn't recognise your email domain, so pick your business
              below.
            </p>
            <div className="mt-8 grid gap-3">
              {BRANDS.map((b) => (
                <button
                  key={b.id}
                  onClick={() => {
                    setBrand(b);
                    go("password");
                  }}
                  className="flex items-center gap-3 rounded-xl border border-gray-200 px-5 py-4 text-left transition hover:border-gray-900"
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: b.accent }}
                  />
                  <span className="font-medium">{b.name}</span>
                </button>
              ))}
            </div>
            <button
              className="mt-8 rounded-xl border border-gray-200 px-6 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50"
              onClick={back}
            >
              Back
            </button>
          </div>
        )}

        {/* ---- Password ---- */}
        {step === "password" && (
          <div className="fade-up" key="password">
            {brand && (
              <div
                className="mb-6 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium"
                style={{ backgroundColor: brand.accentSoft, color: brand.accent }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: brand.accent }}
                />
                {brand.name}
              </div>
            )}
            <h1 className="text-3xl font-semibold tracking-tight">
              Create a password
            </h1>
            <p className="mt-3 text-gray-500">
              You'll use this with your email to sign in. At least 8 characters.
            </p>
            <input
              autoFocus
              type="password"
              className={`${inputClass} mt-8`}
              placeholder="Choose a password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) =>
                e.key === "Enter" && password.length >= 8 && go("mobile")
              }
            />
            {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
            <div className="mt-8 flex gap-3">
              <button
                className="rounded-xl border border-gray-200 px-6 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50"
                onClick={back}
              >
                Back
              </button>
              <button
                className={primaryBtn}
                disabled={password.length < 8}
                onClick={() => go("mobile")}
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* ---- Mobile ---- */}
        {step === "mobile" && (
          <div className="fade-up" key="mobile">
            {brand && (
              <div
                className="mb-6 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium"
                style={{ backgroundColor: brand.accentSoft, color: brand.accent }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: brand.accent }}
                />
                {brand.name}
              </div>
            )}
            <h1 className="text-3xl font-semibold tracking-tight">
              What's the best mobile number for you?
            </h1>
            <input
              autoFocus
              type="tel"
              className={`${inputClass} mt-8`}
              placeholder="07700 900000"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              onKeyDown={(e) =>
                e.key === "Enter" && mobile.trim() && go("photo")
              }
            />
            <div className="mt-8 flex gap-3">
              <button
                className="rounded-xl border border-gray-200 px-6 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50"
                onClick={back}
              >
                Back
              </button>
              <button
                className={primaryBtn}
                disabled={!mobile.trim()}
                onClick={() => go("photo")}
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* ---- Photo ---- */}
        {step === "photo" && (
          <div className="fade-up" key="photo">
            <h1 className="text-3xl font-semibold tracking-tight">
              Add a profile photo
            </h1>
            <p className="mt-3 text-gray-500">
              This appears on your dashboard and can be used in your ad
              creatives.
            </p>
            <div className="mt-8 flex items-center gap-6">
              <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border border-gray-200 bg-gray-50">
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photo}
                    alt="Profile preview"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <svg
                    className="h-10 w-10 text-gray-300"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 12a5 5 0 100-10 5 5 0 000 10zm0 2c-5 0-9 2.5-9 6v2h18v-2c0-3.5-4-6-9-6z" />
                  </svg>
                )}
              </div>
              <label className="cursor-pointer rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50">
                {photo ? "Change photo" : "Upload photo"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handlePhoto(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
            <div className="mt-8 flex gap-3">
              <button
                className="rounded-xl border border-gray-200 px-6 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50"
                onClick={back}
              >
                Back
              </button>
              <button className={primaryBtn} onClick={() => go("platforms")}>
                {photo ? "Continue" : "Skip for now"}
              </button>
            </div>
          </div>
        )}

        {/* ---- Platforms ---- */}
        {step === "platforms" && (
          <div className="fade-up" key="platforms">
            <h1 className="text-3xl font-semibold tracking-tight">
              Where should your ads run?
            </h1>
            <p className="mt-3 text-gray-500">Pick one or both.</p>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {(["instagram", "facebook"] as const).map((p) => {
                const selected = platforms.includes(p);
                return (
                  <button
                    key={p}
                    onClick={() =>
                      setPlatforms((prev) =>
                        selected ? prev.filter((x) => x !== p) : [...prev, p]
                      )
                    }
                    className={`rounded-xl border px-5 py-6 text-left transition ${
                      selected
                        ? "border-gray-900 bg-gray-900 text-white"
                        : "border-gray-200 hover:border-gray-400"
                    }`}
                  >
                    <span className="text-lg font-medium capitalize">{p}</span>
                    <p
                      className={`mt-1 text-sm ${
                        selected ? "text-gray-300" : "text-gray-500"
                      }`}
                    >
                      {p === "instagram"
                        ? "Reels, stories and feed ads"
                        : "Feed, marketplace and local reach"}
                    </p>
                  </button>
                );
              })}
            </div>
            <div className="mt-8 flex gap-3">
              <button
                className="rounded-xl border border-gray-200 px-6 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50"
                onClick={back}
              >
                Back
              </button>
              <button
                className={primaryBtn}
                disabled={platforms.length === 0}
                onClick={() => go("goal")}
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* ---- Goal ---- */}
        {step === "goal" && (
          <div className="fade-up" key="goal">
            <h1 className="text-3xl font-semibold tracking-tight">
              What are you looking to achieve?
            </h1>
            <div className="mt-8 grid gap-3">
              {GOALS.map((g) => (
                <button
                  key={g}
                  onClick={() => setGoal(g)}
                  className={`rounded-xl border px-5 py-4 text-left font-medium transition ${
                    goal === g
                      ? "border-gray-900 bg-gray-900 text-white"
                      : "border-gray-200 hover:border-gray-400"
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
            <div className="mt-8 flex gap-3">
              <button
                className="rounded-xl border border-gray-200 px-6 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50"
                onClick={back}
              >
                Back
              </button>
              <button
                className={primaryBtn}
                disabled={!goal}
                onClick={() => go("package")}
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* ---- Package ---- */}
        {step === "package" && (
          <div className="fade-up" key="package">
            <h1 className="text-3xl font-semibold tracking-tight">
              Pick your package
            </h1>
            <div className="mt-8 grid gap-3">
              {PACKAGES.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPackageId(p.id)}
                  className={`flex items-center justify-between rounded-xl border px-5 py-4 text-left transition ${
                    packageId === p.id
                      ? "border-gray-900 ring-4 ring-gray-100"
                      : "border-gray-200 hover:border-gray-400"
                  }`}
                >
                  <div>
                    <span className="font-semibold">{p.name}</span>
                    {p.highlighted && (
                      <span className="ml-2 rounded-full bg-gray-900 px-2 py-0.5 text-xs font-medium text-white">
                        Popular
                      </span>
                    )}
                    <p className="mt-0.5 text-sm text-gray-500">{p.tagline}</p>
                  </div>
                  <span className="text-lg font-semibold">
                    £{p.price}
                    <span className="text-sm font-normal text-gray-400">
                      /mo
                    </span>
                  </span>
                </button>
              ))}
            </div>
            <div className="mt-8 flex gap-3">
              <button
                className="rounded-xl border border-gray-200 px-6 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50"
                onClick={back}
              >
                Back
              </button>
              <button
                className={primaryBtn}
                disabled={!packageId}
                onClick={() => go("payment")}
              >
                Continue to payment
              </button>
            </div>
          </div>
        )}

        {/* ---- Payment (Stripe placeholder) ---- */}
        {step === "payment" && (
          <div className="fade-up" key="payment">
            <h1 className="text-3xl font-semibold tracking-tight">Payment</h1>
            <div className="mt-8 rounded-2xl border border-gray-200 p-6">
              <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                <span className="text-gray-600">
                  {packageById(packageId)?.name} package
                </span>
                <span className="font-semibold">
                  £{packageById(packageId)?.price}/month
                </span>
              </div>
              {/*
                TODO(stripe): replace this block with Stripe Checkout.
                Flow: POST /api/checkout → create Checkout Session with the
                package's stripePriceId → redirect → webhook marks user paid.
              */}
              <div className="mt-6 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
                <p className="font-medium text-gray-700">
                  Stripe checkout coming soon
                </p>
                <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500">
                  Secure card payment will be handled here. For now, continue
                  in demo mode to preview your dashboard.
                </p>
              </div>
            </div>
            <div className="mt-8 flex gap-3">
              <button
                className="rounded-xl border border-gray-200 px-6 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50"
                onClick={back}
              >
                Back
              </button>
              <button
                className={primaryBtn}
                disabled={submitting}
                onClick={completeSignup}
              >
                {submitting ? "Creating account…" : "Complete signup"}
              </button>
            </div>
            {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
          </div>
        )}
      </div>
    </main>
  );
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupWizard />
    </Suspense>
  );
}
