"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PasswordInput from "@/components/PasswordInput";

export default function ResetForm({
  token,
  purpose,
  name,
  email,
}: {
  token: string;
  purpose: "reset" | "invite";
  name: string;
  email: string;
}) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const invite = purpose === "invite";

  async function submit() {
    if (busy) return;
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    setError("");
    setBusy(true);
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password, purpose }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data?.error ?? "Couldn't set your password.");
      setBusy(false);
      return;
    }
    // Redeeming signs them in, so go straight where they need to be.
    router.push(invite ? "/dashboard/referrals" : "/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-semibold tracking-tight">
          {invite ? `Welcome, ${name.split(" ")[0]}` : "Set a new password"}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-gray-500">
          {invite
            ? "Choose a password and your account is ready to use."
            : `Setting a new password for ${email}.`}
        </p>

        <div className="mt-8">
          <PasswordInput
            value={password}
            onChange={setPassword}
            placeholder="New password"
          />
        </div>
        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

        <button
          onClick={submit}
          disabled={busy}
          className="mt-6 w-full rounded-xl bg-gray-900 py-3 text-sm font-medium text-white transition hover:bg-gray-700 disabled:opacity-40"
        >
          {busy ? "Saving…" : invite ? "Set up my account" : "Save password"}
        </button>
      </div>
    </main>
  );
}
