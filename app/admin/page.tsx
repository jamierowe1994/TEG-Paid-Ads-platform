"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BRANDS, brandById } from "@/lib/brands";
import { packageById } from "@/lib/packages";
import BrandMark from "@/components/BrandMark";
import type { UserProfile } from "@/lib/types";

// Admin backend. Password-gated (ADMIN_PASSWORD env var, default
// "experts-admin") — upgrade to proper admin accounts later. Shows signed-up
// agents, feedback from the annotation widget, and the Meta Ads connection.

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
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [selected, setSelected] = useState<FeedbackItem | null>(null);
  const [loading, setLoading] = useState(false);

  // Load everything the admin dashboard shows. Returns false if the password
  // is rejected (so the login form can show an error).
  async function loadData(pass: string): Promise<boolean> {
    const headers = { Authorization: `Bearer ${pass}` };
    const [fb, us] = await Promise.all([
      fetch("/api/feedback", { headers }),
      fetch("/api/admin/users", { headers }),
    ]);
    if (!fb.ok || !us.ok) return false;
    setFeedback(await fb.json());
    setUsers(await us.json());
    return true;
  }

  async function signIn() {
    setLoading(true);
    setError("");
    const ok = await loadData(password).catch(() => false);
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
    loadData(saved).then((ok) => {
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
        {/* Brand overview strip — live signup counts */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {BRANDS.map((b) => {
            const count = users.filter((u) => u.brandId === b.id).length;
            return (
              <div
                key={b.id}
                className="rounded-2xl border border-gray-200 bg-white p-4"
              >
                <div className="flex items-center gap-2.5">
                  <BrandMark
                    name={b.name}
                    accent={b.accent}
                    logo={b.logo}
                    size={28}
                  />
                  <p className="text-sm font-medium">{b.shortName}</p>
                </div>
                <p className="mt-2 text-2xl font-semibold">{count}</p>
                <p className="text-xs text-gray-400">
                  signed-up agent{count === 1 ? "" : "s"}
                </p>
              </div>
            );
          })}
        </div>

        {/* Meta Ads connection */}
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Meta Ads connection</h2>
          <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                  <span className="text-sm font-medium">Not connected</span>
                </div>
                <p className="mt-2 max-w-xl text-sm text-gray-500">
                  Connect the Experts Group Meta Business account to pull each
                  agent's campaign stats (impressions, clicks, leads) and route
                  new leads into their dashboard. Each agent's ads are mapped to
                  their account below, so everyone only sees their own numbers.
                </p>
              </div>
              {/* TODO(meta): OAuth into the Meta Marketing API. Needs
                  META_APP_ID / META_APP_SECRET / META_ACCESS_TOKEN env vars,
                  then exchange for a long-lived token and store per-account. */}
              <button
                disabled
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white opacity-40"
                title="Meta integration coming soon"
              >
                Connect Meta
              </button>
            </div>
            <div className="mt-5 grid gap-3 rounded-xl bg-gray-50 p-4 text-xs text-gray-500 sm:grid-cols-3">
              <div>
                <p className="font-medium text-gray-700">1. Connect</p>
                Authorise the Meta Business account once, here.
              </div>
              <div>
                <p className="font-medium text-gray-700">2. Map campaigns</p>
                Link each agent to their ad campaign (below).
              </div>
              <div>
                <p className="font-medium text-gray-700">3. Auto stats + leads</p>
                Their dashboard fills with their own numbers.
              </div>
            </div>
          </div>
        </section>

        {/* Signups + campaign mapping */}
        <section className="mt-10">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              Signed-up agents{" "}
              <span className="text-sm font-normal text-gray-400">
                {users.length}
              </span>
            </h2>
            <button
              onClick={() => loadData(password)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-50"
            >
              Refresh
            </button>
          </div>
          <div className="mt-4 overflow-x-auto rounded-2xl border border-gray-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                <tr>
                  <th className="px-5 py-3 font-medium">Agent</th>
                  <th className="px-5 py-3 font-medium">Business</th>
                  <th className="px-5 py-3 font-medium">Package</th>
                  <th className="px-5 py-3 font-medium">Platforms</th>
                  <th className="px-5 py-3 font-medium">Meta campaign</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {users.map((u) => {
                  const b = brandById(u.brandId);
                  return (
                    <tr key={u.id}>
                      <td className="px-5 py-3">
                        <p className="font-medium text-gray-800">{u.name}</p>
                        <p className="text-xs text-gray-400">{u.email}</p>
                      </td>
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: b?.accent }}
                          />
                          {b?.shortName ?? u.brandId}
                        </span>
                      </td>
                      <td className="px-5 py-3 capitalize">
                        {packageById(u.packageId)?.name ?? u.packageId}
                      </td>
                      <td className="px-5 py-3 capitalize text-gray-500">
                        {u.platforms.join(", ") || "—"}
                      </td>
                      <td className="px-5 py-3">
                        {/* TODO(meta): persist this mapping once Meta is wired */}
                        <input
                          placeholder="Campaign ID"
                          className="w-32 rounded-lg border border-gray-200 px-2 py-1 text-xs outline-none focus:border-gray-900"
                        />
                      </td>
                    </tr>
                  );
                })}
                {users.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-5 py-12 text-center text-sm text-gray-400"
                    >
                      No signups yet. New agents appear here the moment they
                      complete signup.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

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
              onClick={() => loadData(password)}
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
