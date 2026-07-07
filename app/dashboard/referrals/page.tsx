"use client";

import { useEffect, useState } from "react";
import { getUser, getReferrals, saveReferrals, uid } from "@/lib/session";
import { BRANDS, brandById, type Brand } from "@/lib/brands";
import type { Referral } from "@/lib/types";

// Referrals portal — send leads to sister businesses in the group and see
// referrals sent back to you. Cross-account delivery needs the real backend;
// for now sent referrals are stored locally and received ones are seeded.

export default function ReferralsPage() {
  const [brand, setBrand] = useState<Brand | null>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [tab, setTab] = useState<"received" | "sent">("received");
  const [showForm, setShowForm] = useState(false);

  // form state
  const [toBrandId, setToBrandId] = useState("");
  const [leadName, setLeadName] = useState("");
  const [leadContact, setLeadContact] = useState("");
  const [note, setNote] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => {
    const u = getUser();
    if (!u) return;
    setBrand(brandById(u.brandId) ?? null);
    setReferrals(getReferrals());
  }, []);

  if (!brand) return null;

  const visible = referrals.filter((r) => r.direction === tab);
  const otherBrands = BRANDS.filter((b) => b.id !== brand.id);

  function sendReferral() {
    if (!brand || !toBrandId || !leadName.trim() || !leadContact.trim()) return;
    const referral: Referral = {
      id: uid(),
      direction: "sent",
      fromBrandId: brand.id,
      toBrandId: toBrandId as Referral["toBrandId"],
      leadName: leadName.trim(),
      leadContact: leadContact.trim(),
      note: note.trim(),
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    const next = [referral, ...referrals];
    setReferrals(next);
    saveReferrals(next);
    setShowForm(false);
    setToBrandId("");
    setLeadName("");
    setLeadContact("");
    setNote("");
    setTab("sent");
    setToast(`Referral sent to ${brandById(referral.toBrandId)?.name} ✓`);
    setTimeout(() => setToast(""), 3500);
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Referrals</h1>
          <p className="mt-2 text-gray-500">
            Pass leads to other Experts Group businesses — and get them passed
            back to you.
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="rounded-xl px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
          style={{ backgroundColor: brand.accent }}
        >
          + Refer a lead
        </button>
      </div>

      {/* Tabs */}
      <div className="mt-8 flex gap-2 border-b border-gray-100">
        {(["received", "sent"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium capitalize transition ${
              tab === t
                ? "border-gray-900 text-gray-900"
                : "border-transparent text-gray-400 hover:text-gray-600"
            }`}
          >
            {t}{" "}
            <span className="ml-1 text-xs text-gray-400">
              {referrals.filter((r) => r.direction === t).length}
            </span>
          </button>
        ))}
      </div>

      {/* List */}
      <div className="mt-6 space-y-4">
        {visible.map((r) => {
          const from = brandById(r.fromBrandId);
          const to = brandById(r.toBrandId);
          const other = tab === "received" ? from : to;
          return (
            <div key={r.id} className="rounded-2xl border border-gray-200 p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold">{r.leadName}</h3>
                  <p className="mt-1 text-sm text-gray-500">{r.leadContact}</p>
                  {r.note && (
                    <p className="mt-2 text-sm text-gray-600">“{r.note}”</p>
                  )}
                  <p className="mt-3 flex items-center gap-2 text-xs text-gray-400">
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: other?.accent }}
                    />
                    {tab === "received" ? "From" : "To"} {other?.name} ·{" "}
                    {new Date(r.createdAt).toLocaleDateString("en-GB")}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium capitalize ${
                    r.status === "pending"
                      ? "bg-amber-50 text-amber-600"
                      : r.status === "accepted"
                        ? "bg-blue-50 text-blue-600"
                        : "bg-green-50 text-green-600"
                  }`}
                >
                  {r.status}
                </span>
              </div>
            </div>
          );
        })}
        {visible.length === 0 && (
          <div className="rounded-2xl border border-dashed border-gray-200 py-16 text-center text-sm text-gray-400">
            No {tab} referrals yet.
          </div>
        )}
      </div>

      {/* Refer modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/30 p-6 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold">Refer a lead</h2>
            <p className="mt-1 text-sm text-gray-500">
              Send this lead to another business in the group.
            </p>
            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Send to
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {otherBrands.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => setToBrandId(b.id)}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition ${
                        toBrandId === b.id
                          ? "border-gray-900 ring-2 ring-gray-100"
                          : "border-gray-200 hover:border-gray-400"
                      }`}
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: b.accent }}
                      />
                      {b.shortName}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Lead name
                </label>
                <input
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-gray-900"
                  value={leadName}
                  onChange={(e) => setLeadName(e.target.value)}
                  placeholder="Full name"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Phone or email
                </label>
                <input
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-gray-900"
                  value={leadContact}
                  onChange={(e) => setLeadContact(e.target.value)}
                  placeholder="07700 900000"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Note <span className="text-gray-400">(optional)</span>
                </label>
                <textarea
                  className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-gray-900"
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Any context that helps them close it"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowForm(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={sendReferral}
                disabled={!toBrandId || !leadName.trim() || !leadContact.trim()}
                className="rounded-lg px-5 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-30"
                style={{ backgroundColor: brand.accent }}
              >
                Send referral
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-gray-900 px-5 py-3 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
