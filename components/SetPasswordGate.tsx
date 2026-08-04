"use client";

import { useState } from "react";
import { saveUser } from "@/lib/session";
import PasswordInput from "@/components/PasswordInput";
import type { UserProfile } from "@/lib/types";

// Full-screen blocker for pre-provisioned (bulk-imported) accounts: they've
// just signed in with the shared launch password, and nothing else happens
// until they set one of their own. Renders over the whole dashboard.
export default function SetPasswordGate({
  user,
  accent,
  onDone,
}: {
  user: UserProfile;
  accent: string;
  onDone: (u: UserProfile) => void;
}) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const inputClass =
    "w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-gray-900";
  // Only judge the confirmation once there's something to judge, so the
  // "don't match yet" hint doesn't shout at someone mid-keystroke.
  const match = pw.length > 0 && pw2.length > 0 && pw === pw2;
  const mismatch = pw.length > 0 && pw2.length > 0 && pw !== pw2;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (pw.length < 8) {
      setError("At least 8 characters, please.");
      return;
    }
    if (pw !== pw2) {
      setError("Those don't match — try again.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/auth/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't save — please try again.");
        return;
      }
      saveUser(data.user);
      onDone(data.user);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-950/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl">
        <span
          className="flex h-12 w-12 items-center justify-center rounded-2xl text-2xl"
          style={{ backgroundColor: `${accent}1a` }}
        >
          🔐
        </span>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">
          Welcome, {user.name.split(" ")[0]} — set your password
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          Your account was set up for you with a shared starter password.
          Choose your own to secure it — you&apos;ll use it from now on.
        </p>
        <form onSubmit={submit} className="mt-6 space-y-3">
          {/* PasswordInput carries the reveal toggle. Being able to SEE what
              you typed matters more here than anywhere else in the app: this
              password is set once, on a shared starter password, and a typo
              locks someone out of an account they've never used. */}
          <PasswordInput
            autoFocus
            value={pw}
            onChange={(v) => {
              setPw(v);
              setError("");
            }}
            placeholder="New password (8+ characters)"
            className={inputClass}
          />
          <PasswordInput
            value={pw2}
            onChange={(v) => {
              setPw2(v);
              setError("");
            }}
            placeholder="Type it again"
            className={inputClass}
          />
          {/* Confirm the match as they type rather than only on submit — the
              point is to catch the typo before it's saved, not after. */}
          {!error && match && (
            <p className="text-sm font-medium text-green-600">Passwords match</p>
          )}
          {!error && mismatch && (
            <p className="text-sm text-gray-400">Passwords don&apos;t match yet</p>
          )}
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={saving || !match || pw.length < 8}
            className="w-full rounded-xl py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: accent }}
          >
            {saving ? "Saving…" : "Set password & continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
