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
        <label className="mt-4 flex cursor-pointer select-none items-center gap-2.5 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 accent-gray-900"
          />
          Keep me signed in for a month
        </label>
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
