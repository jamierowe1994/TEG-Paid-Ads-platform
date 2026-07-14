"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { logIn } from "@/lib/session";
import { EXPERTS_GROUP, isAllowedEmailDomain } from "@/lib/brands";
import BrandMark from "@/components/BrandMark";
import PasswordInput from "@/components/PasswordInput";
import DomainDenied from "@/components/DomainDenied";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  // Prefilled when handed over from signup ("you already have an account").
  const prefilled = params.get("email") ?? "";
  const [email, setEmail] = useState(prefilled);
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);
  // Forgot password — logs an ask for the team (no reset email yet).
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotError, setForgotError] = useState("");

  async function requestReset() {
    const trimmed = email.trim().toLowerCase();
    setForgotError("");
    if (!/^\S+@\S+\.\S+$/.test(trimmed)) {
      setForgotError("Enter your work email above first.");
      return;
    }
    if (!isAllowedEmailDomain(trimmed)) {
      setDenied(true);
      return;
    }
    setForgotBusy(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      if (res.status === 403) {
        setDenied(true);
        return;
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setForgotError(d.error ?? "Couldn't send that — please try again.");
        return;
      }
      setForgotSent(true);
    } catch {
      setForgotError("Network error — please try again.");
    } finally {
      setForgotBusy(false);
    }
  }

  async function signIn() {
    const trimmed = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(trimmed)) {
      setError("That doesn't look like an email address.");
      return;
    }
    // Staff-only: block a non-Experts-Group email before we even try.
    if (!isAllowedEmailDomain(trimmed)) {
      setDenied(true);
      return;
    }
    if (!password) {
      setError("Enter your password.");
      return;
    }
    setBusy(true);
    setError("");
    const { error, code } = await logIn(trimmed, password, remember);
    setBusy(false);
    if (code === "domain") {
      setDenied(true);
      return;
    }
    if (error) {
      setError(error);
      return;
    }
    router.push("/dashboard");
  }

  if (denied) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white px-6 py-16">
        <div className="w-full max-w-lg">
          <DomainDenied
            email={email.trim().toLowerCase()}
            actionLabel="Use a work email"
            onAction={() => {
              setDenied(false);
              setEmail("");
              setPassword("");
            }}
          />
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-10 flex items-center justify-center gap-2.5">
          <BrandMark
            name={EXPERTS_GROUP.name}
            accent={EXPERTS_GROUP.accent}
            logo={EXPERTS_GROUP.logo}
            size={32}
          />
          <span className="text-sm font-semibold">The Experts Group</span>
        </Link>
        <h1 className="text-center text-2xl font-semibold tracking-tight">
          Welcome back
        </h1>
        <p className="mt-2 text-center text-sm text-gray-500">
          Sign in with your work email
        </p>
        <input
          autoFocus={!prefilled}
          type="email"
          className="mt-8 w-full rounded-xl border border-gray-200 px-4 py-3 outline-none transition focus:border-gray-900 focus:ring-4 focus:ring-gray-100"
          placeholder="you@thepropertyexperts.co.uk"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && signIn()}
        />
        <div className="mt-3">
          <PasswordInput
            autoFocus={!!prefilled}
            className="w-full rounded-xl border border-gray-200 px-4 py-3 outline-none transition focus:border-gray-900 focus:ring-4 focus:ring-gray-100"
            placeholder="Password"
            value={password}
            onChange={setPassword}
            onEnter={signIn}
          />
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <label className="flex cursor-pointer select-none items-center gap-2.5 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 accent-gray-900"
            />
            Keep me signed in for a month
          </label>
          <button
            type="button"
            onClick={() => {
              setForgotOpen((v) => !v);
              setForgotError("");
            }}
            className="shrink-0 text-sm font-medium text-gray-400 underline decoration-dotted underline-offset-2 hover:text-gray-700"
          >
            Forgot password?
          </button>
        </div>

        {/* Forgot password — no reset email yet (no system mailbox), so this
            raises it with the team, who issue a temporary password. */}
        {forgotOpen && (
          <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
            {forgotSent ? (
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-600 text-[11px] text-white">
                  ✓
                </span>
                <p className="text-sm text-gray-600">
                  Thanks — we&apos;ve let the team know. They&apos;ll send you a
                  temporary password shortly.
                </p>
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-600">
                  Pop your work email in the box above and we&apos;ll ask the
                  team to send you a temporary password.
                </p>
                {forgotError && (
                  <p className="mt-2 text-sm text-red-500">{forgotError}</p>
                )}
                <button
                  type="button"
                  onClick={requestReset}
                  disabled={forgotBusy}
                  className="mt-3 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700 disabled:opacity-50"
                >
                  {forgotBusy ? "Sending…" : "Request a reset"}
                </button>
              </>
            )}
          </div>
        )}

        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
        <button
          onClick={signIn}
          disabled={busy}
          className="btn-group mt-4 w-full rounded-xl py-3 text-sm font-medium transition disabled:opacity-50"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p className="mt-6 text-center text-sm text-gray-500">
          New here?{" "}
          <Link href="/signup" className="font-medium text-gray-900 underline">
            Choose a package
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
