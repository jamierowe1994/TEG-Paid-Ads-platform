"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  BRANDS,
  brandForEmail,
  isAllowedEmailDomain,
  EXPERTS_GROUP,
  type Brand,
} from "@/lib/brands";
import { PACKAGES, packageById } from "@/lib/packages";
import BrandMark from "@/components/BrandMark";
import PasswordInput from "@/components/PasswordInput";
import DomainDenied from "@/components/DomainDenied";
import { signUp, checkEmail, refreshUser } from "@/lib/session";

// One-question-at-a-time signup. Order:
// name → email (brand auto-detect) → password → package → payment →
// create account → authenticate (connect email, which also pulls their
// mobile/region/headshot from Microsoft).

type StepId =
  | "name"
  | "email"
  | "brand"
  | "interest"
  | "password"
  | "package"
  | "payment"
  | "upgrade"
  | "paid"
  | "authenticate";

type AccountType = "paid" | "referral";

function SignupWizard() {
  const params = useSearchParams();
  const checkout = params.get("checkout");

  // Coming back from Stripe the wizard's state is gone, but the session cookie
  // isn't — so resume at the step that only needs an account, rather than
  // dumping them back at "what's your name".
  const [step, setStep] = useState<StepId>(
    checkout === "success" ? "paid" : "name"
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [brand, setBrand] = useState<Brand | null>(null);
  const [password, setPassword] = useState("");
  // Mobile, region and headshot are pulled from the agent's Microsoft account
  // at the connect step, so the wizard no longer asks for them.
  const [packageId, setPackageId] = useState<string>(
    packageById(params.get("package"))?.id ?? ""
  );
  // Which half of the portal they're signing up for. Chosen on the "interest"
  // step; "referral" gives the free, referrals-only account.
  const [accountType, setAccountType] = useState<AccountType | "">("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Set when the entered email already has an account — the email step swaps
  // to a "you're already with us, sign in" card instead of pressing on.
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);
  const [checkingEmail, setCheckingEmail] = useState(false);
  // Set when the entered email isn't an Experts Group domain — staff only.
  const [domainBlocked, setDomainBlocked] = useState(false);

  /* Does this person pay for Paid Ads at all?
     The Lettings Experts' Pro licence already includes it, so a Pro partner
     must never reach Stripe — they'd be paying twice for the same product. A
     TLE partner who isn't on Pro doesn't get a card form either: buying ads
     separately is worse value than the Pro tier that bundles them, so they're
     sent to upgrade instead. Every other brand pays as before.
     Null = not looked up yet; the wizard keeps the paid path until it knows. */
  const [entitlement, setEntitlement] = useState<{
    outcome: "included" | "needs-upgrade" | "pay";
    partnerPackage: string | null;
    foundInHub: boolean;
  } | null>(null);

  /* Referrals are locked until V2. Defaults to LOCKED so a slow fetch can't
     briefly offer an account type that would arrive empty. */
  const [referralsOn, setReferralsOn] = useState(false);
  useEffect(() => {
    fetch("/api/launch-phase")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setReferralsOn(d?.referralsEnabled === true))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const clean = email.trim().toLowerCase();
    if (!clean || !brand) {
      setEntitlement(null);
      return;
    }
    let cancelled = false;
    fetch("/api/ads-entitlement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: clean, brandId: brand.id }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d?.outcome) return;
        setEntitlement(d);
      })
      // A failed lookup leaves entitlement null → the normal paid path. That's
      // the safe default for every brand except TLE, and TLE's own fallback is
      // handled server-side.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [email, brand]);

  const steps: StepId[] = useMemo(() => {
    const base: StepId[] = [
      "name",
      "email",
      ...(brand ? [] : (["brand"] as StepId[])),
      "interest",
      "password",
    ];
    // Referrals-only accounts skip the paid-ads setup (package → payment).
    if (accountType === "referral") return [...base, "authenticate"];
    // Their licence already includes ads — no package to pick, nothing to pay.
    if (entitlement?.outcome === "included") return [...base, "authenticate"];
    // Their brand bundles ads but their tier doesn't: one step explaining the
    // upgrade, and no card form anywhere in the flow.
    if (entitlement?.outcome === "needs-upgrade") return [...base, "upgrade"];
    // Ads platforms and goal were dropped from onboarding — the team sets
    // targeting per location anyway, so asking was friction with no payoff.
    return [...base, "package", "payment", "authenticate"];
  }, [brand, accountType, entitlement]);
  const stepIndex = steps.indexOf(step === "paid" ? "authenticate" : step);
  const progress = ((stepIndex + 1) / steps.length) * 100;

  /* Coming back from Stripe the wizard is a fresh mount, so name/email/brand
     are blank — which left the last step reading "Sign in with  to confirm".
     The session cookie survives the round trip, so refill from the account
     that was just created. */
  useEffect(() => {
    if (checkout !== "success") return;
    let cancelled = false;
    refreshUser().then((u) => {
      if (cancelled || !u) return;
      setName((n) => n || u.name);
      setEmail((e) => e || u.email);
      setBrand((b) => b ?? BRANDS.find((x) => x.id === u.brandId) ?? null);
      setPackageId((p) => p || u.packageId);
      setAccountType((a) => a || (u.accountType === "referral" ? "referral" : "paid"));
    });
    return () => {
      cancelled = true;
    };
  }, [checkout]);

  function go(next: StepId) {
    setError("");
    setStep(next);
  }

  function back() {
    if (stepIndex > 0) go(steps[stepIndex - 1]);
  }

  async function submitEmail() {
    const trimmed = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(trimmed)) {
      setError("That doesn't look like an email address.");
      return;
    }
    // Staff-only portal: decline anyone who isn't on an Experts Group domain
    // BEFORE they fill anything in (and before they could ever pay).
    if (!isAllowedEmailDomain(trimmed)) {
      setDomainBlocked(true);
      return;
    }
    if (checkingEmail) return;
    // Catch a returning user HERE, not after they've filled the whole form.
    setCheckingEmail(true);
    const { exists } = await checkEmail(trimmed);
    setCheckingEmail(false);
    if (exists) {
      setAlreadyRegistered(true);
      return;
    }
    const detected = brandForEmail(trimmed);
    setBrand(detected ?? null);
    // Record the signup start so the admin CRM can spot drop-offs.
    fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: trimmed,
        name: name.trim(),
        brandId: detected?.id ?? null,
      }),
    }).catch(() => {});
    // Known domain → ask what they're after. Unknown → pick their business first.
    go(detected ? "interest" : "brand");
  }

  /* Where the password step leads. Three destinations, and only one of them
     involves paying us. */
  function afterPassword() {
    if (accountType === "referral") return completeSignup();
    // Licence already includes ads — create the account and go straight on.
    if (entitlement?.outcome === "included") return completeSignup();
    if (entitlement?.outcome === "needs-upgrade") return go("upgrade");
    return go("package");
  }

  /* `asType` overrides the wizard's account type. Needed by the upgrade step,
     which must create a FREE account regardless of the paid path the user was
     on — they aren't entitled to Paid Ads and we aren't charging them, so
     handing them a paid-tier account would give away the product. */
  async function completeSignup(
    advance = true,
    asType?: AccountType
  ): Promise<boolean> {
    if (!brand || submitting) return false;
    setSubmitting(true);
    setError("");
    const { error, code } = await signUp({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
      // Filled from their Microsoft account at the connect step.
      mobile: "",
      photo: null,
      brandId: brand.id,
      // Kept in the payload so the API contract is unchanged, but no longer
      // asked at signup — the team sets targeting per location, and "what do
      // you want to achieve" never changed what we built.
      platforms: [],
      goal: "",
      packageId,
      accountType: (asType ?? accountType) === "referral" ? "referral" : "paid",
    });
    if (error) {
      setSubmitting(false);
      // Send the user back to fix a duplicate email / weak password. A
      // duplicate (they registered in another tab mid-wizard) gets the
      // friendly "sign in instead" card rather than a bare error.
      if (code === "domain") {
        // Server backstop caught a non-Experts-Group domain.
        setDomainBlocked(true);
        go("email");
      } else if (/already exists/i.test(error)) {
        setAlreadyRegistered(true);
        go("email");
      } else if (/email/i.test(error)) {
        setError(error);
        go("email");
      } else if (/password/i.test(error)) {
        setError(error);
        go("password");
      } else {
        setError(error);
      }
      return false;
    }
    // Account created + signed in — now the mandatory email authentication
    // step. The OAuth needs a session, which we now have, so it must come
    // after account creation.
    if (!advance) return true;
    setSubmitting(false);
    go("authenticate");
    return true;
  }

  /* Paid signup: create the account (which signs them in, so /api/checkout has
     a session), then hand off to Stripe Checkout. The account exists at this
     point but is NOT paid — only the webhook sets that, so abandoning the
     Stripe page leaves an account that simply hasn't paid yet rather than a
     free one. */
  async function payAndContinue() {
    if (submitting) return;
    setError("");
    const created = await completeSignup(false);
    if (!created) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.url) {
        // Payments not configured yet, or Stripe refused. The account is made
        // and they're signed in, so let them carry on rather than dead-end.
        setError(
          data?.error ??
            "Couldn't start checkout. Your account is created — continue and we'll sort payment."
        );
        setSubmitting(false);
        go("authenticate");
        return;
      }
      window.location.href = data.url as string;
    } catch {
      setError("Couldn't reach the payment provider. Please try again.");
      setSubmitting(false);
    }
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

        {/* ---- Declined — not an Experts Group domain ---- */}
        {step === "email" && domainBlocked && (
          <DomainDenied
            email={email.trim().toLowerCase()}
            actionLabel="Use a work email"
            onAction={() => {
              setDomainBlocked(false);
              setEmail("");
            }}
          />
        )}

        {/* ---- Email (brand detection) ---- */}
        {step === "email" && !alreadyRegistered && !domainBlocked && (
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
              onKeyDown={(e) =>
                e.key === "Enter" && email && !checkingEmail && submitEmail()
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
                disabled={!email || checkingEmail}
                onClick={submitEmail}
              >
                {checkingEmail ? "Checking…" : "Continue"}
              </button>
            </div>
          </div>
        )}

        {/* ---- Already registered — recognise them and send to sign-in ---- */}
        {step === "email" && alreadyRegistered && (
          <div className="fade-up" key="already">
            <h1 className="text-3xl font-semibold tracking-tight">
              Welcome back, {name.split(" ")[0]} 👋
            </h1>
            <p className="mt-3 text-gray-500">
              You&apos;ve already got an account with{" "}
              <span className="font-medium text-gray-700">
                {email.trim().toLowerCase()}
              </span>
              . No need to sign up again — just sign in.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href={`/login?email=${encodeURIComponent(
                  email.trim().toLowerCase()
                )}`}
                className={primaryBtn}
              >
                Sign in instead
              </Link>
              <button
                className="rounded-xl border border-gray-200 px-6 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50"
                onClick={() => {
                  setAlreadyRegistered(false);
                  setEmail("");
                }}
              >
                Use a different email
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
                    go("interest");
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

        {/* ---- Interest: paid ads vs referrals ---- */}
        {step === "interest" && (
          <div className="fade-up" key="interest">
            <h1 className="text-3xl font-semibold tracking-tight">
              What are you after, {name.split(" ")[0]}?
            </h1>
            <p className="mt-3 text-gray-500">
              {referralsOn
                ? "The Experts Group portal does two things. Pick where you want to start — you can always add the other later."
                : "Let's get your paid ads set up."}
            </p>
            <div
              className={`mt-8 grid gap-4 ${referralsOn ? "sm:grid-cols-2" : ""}`}
            >
              <button
                onClick={() => {
                  setAccountType("paid");
                  go("password");
                }}
                className="group rounded-2xl border-2 border-gray-200 p-6 text-left transition hover:border-gray-900"
              >
                <div className="text-2xl">📣</div>
                <h2 className="mt-3 text-lg font-semibold">Paid Ads</h2>
                <p className="mt-1.5 text-sm text-gray-500">
                  We build and run your paid social campaigns and track every
                  lead.{referralsOn ? " Includes referrals too." : ""}
                </p>
                <span className="mt-4 inline-block text-sm font-medium text-gray-900 group-hover:underline">
                  Set up paid ads →
                </span>
              </button>
              {/* Referrals-only accounts are hidden until V2: choosing one now
                  would create an account whose single feature is switched off. */}
              {referralsOn && (
              <button
                onClick={() => {
                  setAccountType("referral");
                  go("password");
                }}
                className="group rounded-2xl border-2 border-gray-200 p-6 text-left transition hover:border-gray-900"
              >
                <div className="text-2xl">🤝</div>
                <h2 className="mt-3 text-lg font-semibold">
                  Referrals{" "}
                  <span className="align-middle text-xs font-medium text-green-600">
                    Free
                  </span>
                </h2>
                <p className="mt-1.5 text-sm text-gray-500">
                  Pass leads to other Experts Group businesses and earn on every
                  one that converts. No ad spend.
                </p>
                <span className="mt-4 inline-block text-sm font-medium text-gray-900 group-hover:underline">
                  Just referrals →
                </span>
              </button>
              )}
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
            <div className="mt-8">
              <PasswordInput
                autoFocus
                className={inputClass}
                placeholder="Choose a password"
                value={password}
                onChange={setPassword}
                onEnter={() => {
                  if (password.length < 8) return;
                  afterPassword();
                }}
              />
            </div>
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
                disabled={password.length < 8 || submitting}
                onClick={afterPassword}
              >
                {accountType === "referral" ||
                entitlement?.outcome === "included"
                  ? submitting
                    ? "Creating account…"
                    : "Create my account"
                  : "Continue"}
              </button>
            </div>
          </div>
        )}

        {/* ---- Upgrade (TLE, not on Pro) ----
             Deliberately NOT a payment step. Paid Ads is included in the Pro
             licence, so selling it separately here would be charging them more
             for less. The only action is to talk to head office about the
             licence. */}
        {step === "upgrade" && (
          <div className="fade-up" key="upgrade">
            <h1 className="text-3xl font-semibold tracking-tight">
              Paid Ads comes with the Pro licence
            </h1>
            <p className="mt-4 text-[15px] leading-relaxed text-gray-600">
              Paid Ads is included as part of the Pro licence — so rather than
              paying for it separately, upgrading your licence gets you this and
              everything else on Pro.
            </p>
            {entitlement?.foundInHub && entitlement.partnerPackage && (
              <p className="mt-4 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
                You&apos;re currently on the{" "}
                <span className="font-semibold text-gray-900">
                  {entitlement.partnerPackage}
                </span>{" "}
                licence.
              </p>
            )}
            {/* We couldn't confirm their tier at all. Say so plainly rather
                than implying we know they're not entitled — if their record is
                simply missing, being told "you're not on Pro" is both wrong
                and annoying. */}
            {!entitlement?.foundInHub && (
              <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
                We couldn&apos;t confirm your licence automatically. If
                you&apos;re already on Pro, let head office know and
                they&apos;ll get you set up.
              </p>
            )}
            <div className="mt-8 flex flex-wrap gap-3">
              <button
                className={primaryBtn}
                disabled={submitting}
                onClick={() => completeSignup(true, "referral")}
              >
                {submitting ? "Creating account…" : "Create my free account"}
              </button>
              <a
                className="rounded-xl border border-gray-200 px-6 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50"
                href="mailto:info@theexpertsgroup.co.uk?subject=Upgrading%20to%20the%20Pro%20licence"
              >
                Ask about Pro
              </a>
            </div>
            <p className="mt-4 text-xs text-gray-400">
              {referralsOn
                ? "Your account still gives you everything on your current licence."
                : "We'll set your account up now so it's ready the moment you upgrade."}
            </p>
            {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
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
                  <div className="pr-4">
                    <span className="font-semibold">{p.name}</span>
                    {p.highlighted && (
                      <span className="ml-2 rounded-full bg-gray-900 px-2 py-0.5 text-xs font-medium text-white">
                        Popular
                      </span>
                    )}
                    <p className="mt-0.5 text-sm text-gray-500">{p.tagline}</p>
                  </div>
                  {/* Daily spend is what's being chosen; the monthly total
                      (management + ad spend) sits under it. */}
                  <span className="shrink-0 text-right">
                    <span className="block text-lg font-semibold">
                      £{p.dailyAdSpend}
                      <span className="text-sm font-normal text-gray-400">
                        /day
                      </span>
                    </span>
                    <span className="mt-0.5 block text-xs text-gray-400">
                      approx. £{p.price}/mo
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
            {checkout === "cancelled" && (
              <p className="mt-3 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
                Payment cancelled — nothing has been charged. Your account is
                saved; pick up where you left off whenever you're ready.
              </p>
            )}
            <div className="mt-8 rounded-2xl border border-gray-200 p-6">
              <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                <span className="text-gray-600">
                  {packageById(packageId)?.name} package
                </span>
                <span className="font-semibold">
                  £{packageById(packageId)?.price}/month
                </span>
              </div>
              {/* The split, spelled out — "simple, transparent pricing" is the
                  whole pitch, so don't show a single lump sum. */}
              <div className="mt-4 space-y-1.5 text-sm text-gray-500">
                <div className="flex items-center justify-between">
                  <span>Management fee</span>
                  <span>£{packageById(packageId)?.managementFee}/month</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>
                    Ad spend (£{packageById(packageId)?.dailyAdSpend}/day)
                  </span>
                  <span>approx. £{packageById(packageId)?.adSpend}/month</span>
                </div>
              </div>
              <p className="mt-6 text-sm leading-relaxed text-gray-500">
                Card details are taken by Stripe on their own secure page — we
                never see or store them. Three-month minimum, then rolling
                monthly; you can change tier at any renewal.
              </p>
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
                onClick={payAndContinue}
              >
                {submitting ? "Taking you to Stripe…" : "Continue to payment"}
              </button>
            </div>
            {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
          </div>
        )}

        {/* ---- Authenticate — mandatory: connect the work email to prove
             it's really theirs (and switch on portal email sending) ---- */}
        {/* ---- Payment confirmed ---- */}
        {step === "paid" && (
          <div className="fade-up" key="paid">
            <div className="flex flex-col items-center py-6 text-center">
              <div className="relative flex h-24 w-24 items-center justify-center">
                {/* Ring of colour that expands away once the tick lands. */}
                <span
                  aria-hidden
                  className="pay-pulse absolute inset-0 rounded-full"
                  style={{ background: "rgba(167,42,53,0.35)" }}
                />
                <span
                  className="pay-ring relative flex h-24 w-24 items-center justify-center rounded-full"
                  style={{ background: "var(--group)" }}
                >
                  <svg
                    viewBox="0 0 32 32"
                    className="h-11 w-11"
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path className="pay-check" d="M8 16.5l5.5 5.5L24 11" />
                  </svg>
                </span>
              </div>

              <h1 className="mt-7 text-3xl font-semibold tracking-tight">
                Payment made
              </h1>
              <p className="mt-3 max-w-sm text-gray-500">
                You&apos;re on the{" "}
                <span className="font-medium text-gray-900">
                  {packageById(packageId)?.name ?? "Launch Pad"}
                </span>{" "}
                package. Stripe has emailed your receipt — one more step and
                you&apos;re in.
              </p>

              <button
                className={`${primaryBtn} mt-8`}
                onClick={() => go("authenticate")}
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {step === "authenticate" && (
          <div className="fade-up" key="authenticate">
            <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-900 text-xl text-white">
              ✉️
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">
              Last step, {name.split(" ")[0]} — let&apos;s verify it&apos;s you
            </h1>
            <p className="mt-3 text-gray-500">
              Sign in with{" "}
              <span className="font-medium text-gray-700">
                {email.trim().toLowerCase()}
              </span>{" "}
              to confirm this inbox is really yours. It&apos;s also how
              you&apos;ll send lead emails from the portal — they go out from
              your own address.
            </p>
            <div className="mt-8">
              <a
                href="/api/auth/microsoft/start"
                className="inline-flex items-center gap-2.5 rounded-xl bg-gray-900 px-6 py-3.5 text-sm font-medium text-white transition hover:bg-gray-700"
              >
                <svg viewBox="0 0 21 21" className="h-4 w-4" aria-hidden>
                  <rect x="1" y="1" width="9" height="9" fill="#fff" opacity="0.9" />
                  <rect x="11" y="1" width="9" height="9" fill="#fff" opacity="0.7" />
                  <rect x="1" y="11" width="9" height="9" fill="#fff" opacity="0.7" />
                  <rect x="11" y="11" width="9" height="9" fill="#fff" opacity="0.5" />
                </svg>
                Connect with Microsoft
              </a>
            </div>
            <p className="mt-5 max-w-md text-xs text-gray-400">
              We only ever send email as you, from your own mailbox — the portal
              can&apos;t read your inbox.
            </p>
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
