"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getUser } from "@/lib/session";
import { brandForEmail } from "@/lib/brands";

// Demo sign-in. Once Stripe + a real database exist this becomes proper
// auth (magic link or password) checking the customer has an active
// subscription before letting them in.

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  function signIn() {
    const trimmed = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(trimmed)) {
      setError("That doesn't look like an email address.");
      return;
    }
    const existing = getUser();
    if (existing && existing.email === trimmed) {
      router.push("/dashboard");
      return;
    }
    if (brandForEmail(trimmed)) {
      setError(
        "No account found for that email on this device. Sign up first — it only takes a minute."
      );
      return;
    }
    setError(
      "We don't recognise that email. Use your Experts Group work email, or sign up to get started."
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-10 flex items-center justify-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-900 text-sm font-bold text-white">
            E
          </div>
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
        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
        <button
          onClick={signIn}
          className="mt-4 w-full rounded-xl bg-gray-900 py-3 text-sm font-medium text-white transition hover:bg-gray-700"
        >
          Sign in
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
