"use client";

// Add your own lead — the funnel shouldn't only hold what Meta sends.
// Agents run their own Google Ads, canvass, get word-of-mouth enquiries, and
// asked to track those here alongside everything else (launch-day feedback).
//
// Name + mobile + email are MANDATORY (James): a lead you can't contact isn't
// a lead, and optional-everything is how a funnel becomes a junk drawer.
// Address and a note are optional; the source list is fixed, not free text,
// so the source stats stay countable.

import { useState } from "react";
import type { Lead } from "@/lib/types";

const SOURCES: { id: string; label: string }[] = [
  { id: "self", label: "Self-generated" },
  { id: "google", label: "Google Ads" },
  { id: "website", label: "My website" },
  { id: "canvassing", label: "Canvassing" },
  { id: "other", label: "Other" },
];

export default function AddLeadSheet({
  accent,
  onClose,
  onAdded,
}: {
  accent: string;
  onClose: () => void;
  onAdded: (lead: Lead) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [source, setSource] = useState("self");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const ready = name.trim() && phone.trim() && email.trim();

  async function submit() {
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/leads/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, email, source, address, note }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? "Couldn't save the lead.");
        setBusy(false);
        return;
      }
      onAdded(d.lead);
      onClose();
    } catch {
      setError("Couldn't reach the server.");
      setBusy(false);
    }
  }

  const field =
    "w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-[15px] outline-none transition focus:border-gray-900";

  return (
    <div
      className="fixed inset-0 z-[108] flex items-end justify-center bg-gray-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-lg animate-[sheet-up_0.46s_cubic-bezier(0.34,1.56,0.64,1)] overflow-y-auto rounded-t-3xl bg-white px-6 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-7 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-center text-lg font-semibold tracking-tight text-gray-900">
          Add a lead
        </p>
        <p className="mt-1 text-center text-sm text-gray-500">
          Track a lead you generated yourself, right alongside the rest.
        </p>

        <div className="mt-5 space-y-3">
          <input className={field} placeholder="Full name *" value={name} onChange={(e) => setName(e.target.value)} />
          <input className={field} placeholder="Mobile number *" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <input className={field} placeholder="Email *" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              Where did they come from?
            </p>
            <div className="flex flex-wrap gap-2">
              {SOURCES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSource(s.id)}
                  className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                    source === s.id ? "text-white" : "border-gray-200 text-gray-700"
                  }`}
                  style={source === s.id ? { backgroundColor: accent, borderColor: accent } : undefined}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <input className={field} placeholder="Address (optional)" value={address} onChange={(e) => setAddress(e.target.value)} />
          <textarea className={`${field} min-h-[70px] resize-none`} placeholder="Anything worth remembering (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>

        {error && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        <button
          onClick={submit}
          disabled={!ready || busy}
          className="mt-5 w-full rounded-2xl py-3.5 text-sm font-semibold text-white transition disabled:opacity-40"
          style={{ backgroundColor: accent }}
        >
          {busy ? "Saving…" : "Add lead"}
        </button>
        <button
          onClick={onClose}
          disabled={busy}
          className="mt-2 w-full rounded-2xl py-2.5 text-sm font-medium text-gray-400"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
