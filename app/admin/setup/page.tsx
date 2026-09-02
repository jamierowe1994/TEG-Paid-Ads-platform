"use client";

/* Where an admin-centre invite link lands. Checks the link, asks for a
   password, and signs them straight into the admin centre — no second trip
   through the login form for someone who has just proved who they are. */

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import PasswordInput from "@/components/PasswordInput";

function SetupInner() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";

  const [who, setWho] = useState<{
    name: string;
    email: string;
    brandName: string;
    role: string;
  } | null>(null);
  const [dead, setDead] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      setDead(true);
      return;
    }
    fetch(`/api/admin/team/setup?token=${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => (d?.ok ? setWho(d) : setDead(true)))
      .catch(() => setDead(true));
  }, [token]);

  async function submit() {
    if (busy) return;
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Those two passwords don't match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/team/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error ?? "Couldn't set your password.");
        setBusy(false);
        return;
      }
      // Same session shape the admin page writes for itself on login.
      sessionStorage.setItem(
        "teg_admin_v2",
        JSON.stringify({
          token: d.token,
          role: d.role,
          brandId: d.brandId,
          name: d.name,
          email: d.email,
        })
      );
      router.replace("/admin");
    } catch {
      setError("Couldn't reach the server.");
      setBusy(false);
    }
  }

  if (dead) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white px-6">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-2xl font-semibold tracking-tight">This link has expired</h1>
          <p className="mt-3 text-sm leading-relaxed text-gray-500">
            Invite links can only be used once and last two weeks. Ask whoever
            invited you to send another.
          </p>
          <Link
            href="/admin"
            className="mt-6 inline-block rounded-xl bg-gray-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-gray-700"
          >
            Admin sign in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6">
      <div className="w-full max-w-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
          Launch Pad admin centre
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {who ? `Welcome, ${who.name.split(" ")[0]}` : "Checking your link…"}
        </h1>
        {who && (
          <p className="mt-2 text-sm text-gray-500">
            {who.role === "md" ? "Managing Director" : "Marketing"} access for{" "}
            {who.brandName}, signing in as {who.email}. Choose a password to
            finish.
          </p>
        )}

        {who && (
          <div className="mt-6 space-y-3">
            <PasswordInput
              value={password}
              onChange={setPassword}
              placeholder="Choose a password"
              autoFocus
            />
            <PasswordInput
              value={confirm}
              onChange={setConfirm}
              placeholder="And again"
              onEnter={submit}
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              onClick={submit}
              disabled={busy || !password || !confirm}
              className="w-full rounded-xl bg-gray-900 py-3 text-sm font-medium text-white transition hover:bg-gray-700 disabled:opacity-40"
            >
              {busy ? "Setting up…" : "Set password and sign in"}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

export default function AdminSetupPage() {
  return (
    <Suspense fallback={null}>
      <SetupInner />
    </Suspense>
  );
}
