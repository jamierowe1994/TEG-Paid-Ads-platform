"use client";

import { useState } from "react";
import { saveUser } from "@/lib/session";
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
          <input
            type="password"
            autoFocus
            value={pw}
            onChange={(e) => {
              setPw(e.target.value);
              setError("");
            }}
            placeholder="New password (8+ characters)"
            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-gray-900"
          />
          <input
            type="password"
            value={pw2}
            onChange={(e) => {
              setPw2(e.target.value);
              setError("");
            }}
            placeholder="Type it again"
            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-gray-900"
          />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={saving || !pw || !pw2}
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
