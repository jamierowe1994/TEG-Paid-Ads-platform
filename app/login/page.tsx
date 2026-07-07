"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { logIn } from "@/lib/session";
import { EXPERTS_GROUP } from "@/lib/brands";
import BrandMark from "@/components/BrandMark";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn() {
    const trimmed = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(trimmed)) {
      setError("That doesn't look like an email address.");
      return;
    }
    if (!password) {
      setError("Enter your password.");
      return;
    }
    setBusy(true);
    setError("");
    const { error } = await logIn(trimmed, password);
    setBusy(false);
    if (error) {
      setError(error);
      return;
    }
    router.push("/dashboard");
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
          autoFocus
          type="email"
          className="mt-8 w-full rounded-xl border border-gray-200 px-4 py-3 outline-none transition focus:border-gray-900 focus:ring-4 focus:ring-gray-100"
          placeholder="you@thepropertyexperts.co.uk"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && signIn()}
        />
        <input
          type="password"
          className="mt-3 w-full rounded-xl border border-gray-200 px-4 py-3 outline-none transition focus:border-gray-900 focus:ring-4 focus:ring-gray-100"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && signIn()}
        />
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
