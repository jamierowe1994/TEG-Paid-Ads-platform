"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BRANDS } from "@/lib/brands";

// Admin backend. Password-gated (ADMIN_PASSWORD env var, default
// "experts-admin") — upgrade to proper admin accounts later. Currently
// shows feedback submitted via the annotation widget; user/lead admin
// views slot in once there's a real database.

interface FeedbackItem {
  id: string;
  note: string;
  page: string;
  email: string | null;
  screenshot: string | null;
  createdAt: string;
}

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [selected, setSelected] = useState<FeedbackItem | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadFeedback(pass: string): Promise<boolean> {
    const res = await fetch("/api/feedback", {
      headers: { Authorization: `Bearer ${pass}` },
    });
    if (!res.ok) return false;
    setFeedback(await res.json());
    return true;
  }

  async function signIn() {
    setLoading(true);
    setError("");
    const ok = await loadFeedback(password).catch(() => false);
    setLoading(false);
    if (ok) {
      setAuthed(true);
      sessionStorage.setItem("teg_admin", password);
    } else {
      setError("Wrong password.");
    }
  }

  // Restore admin session on refresh
  useEffect(() => {
    const saved = sessionStorage.getItem("teg_admin");
    if (!saved) return;
    loadFeedback(saved).then((ok) => {
      if (ok) {
        setPassword(saved);
        setAuthed(true);
      }
    });
  }, []);

  if (!authed) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6">
        <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-8">
          <div className="mb-6 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-900 text-sm font-bold text-white">
              E
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold">The Experts Group</p>
              <p className="text-xs text-gray-400">Admin</p>
            </div>
          </div>
          <input
            autoFocus
            type="password"
            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-gray-900"
            placeholder="Admin password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && signIn()}
          />
          {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
          <button
            onClick={signIn}
            disabled={loading || !password}
            className="mt-4 w-full rounded-xl bg-gray-900 py-3 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {loading ? "Checking…" : "Sign in"}
          </button>
          <Link
            href="/"
            className="mt-6 block text-center text-xs text-gray-400 hover:text-gray-600"
          >
            ← Back to site
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-900 text-sm font-bold text-white">
              E
            </div>
            <span className="text-sm font-semibold">Admin</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/" className="text-gray-500 hover:text-gray-900">
              View site
            </Link>
            <button
              onClick={() => {
                sessionStorage.removeItem("teg_admin");
                setAuthed(false);
                setPassword("");
              }}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-gray-500 hover:bg-gray-50"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-10">
        {/* Brand overview strip */}
        <div className="grid gap-4 sm:grid-cols-5">
          {BRANDS.map((b) => (
            <div
              key={b.id}
              className="rounded-2xl border border-gray-200 bg-white p-4"
            >
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: b.accent }}
              />
              <p className="mt-2 text-sm font-medium">{b.shortName}</p>
              <p className="text-xs text-gray-400">
                Signups &amp; campaign stats live here once the database is in
              </p>
            </div>
          ))}
        </div>

        {/* Feedback inbox */}
        <section className="mt-10">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              Feedback inbox{" "}
              <span className="text-sm font-normal text-gray-400">
                {feedback.length} item{feedback.length === 1 ? "" : "s"}
              </span>
            </h2>
            <button
              onClick={() => loadFeedback(password)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-50"
            >
              Refresh
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {feedback.map((f) => (
              <div
                key={f.id}
                className="rounded-2xl border border-gray-200 bg-white p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm text-gray-800">{f.note}</p>
                    <p className="mt-2 text-xs text-gray-400">
                      {f.email ?? "Anonymous"} · page {f.page || "/"} ·{" "}
                      {new Date(f.createdAt).toLocaleString("en-GB")}
                    </p>
                  </div>
                  {f.screenshot && (
                    <button
                      onClick={() => setSelected(f)}
                      className="shrink-0 overflow-hidden rounded-lg border border-gray-200 transition hover:ring-2 hover:ring-gray-300"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={f.screenshot}
                        alt="Feedback screenshot"
                        className="h-16 w-24 object-cover"
                      />
                    </button>
                  )}
                </div>
              </div>
            ))}
            {feedback.length === 0 && (
              <div className="rounded-2xl border border-dashed border-gray-200 bg-white py-16 text-center text-sm text-gray-400">
                No feedback yet. The widget on the bottom-right of every page
                sends notes and annotated screenshots here.
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Screenshot viewer */}
      {selected?.screenshot && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 p-8"
          onClick={() => setSelected(null)}
        >
          <div className="max-h-full max-w-4xl overflow-auto rounded-2xl bg-white p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selected.screenshot}
              alt="Feedback screenshot"
              className="rounded-lg"
            />
            <p className="mt-3 text-sm text-gray-700">{selected.note}</p>
          </div>
        </div>
      )}
    </main>
  );
}
