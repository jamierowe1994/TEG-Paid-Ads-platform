"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getUser,
  fetchReferrals,
  sendReferral,
  actOnReferral,
} from "@/lib/session";
import { BRANDS, brandById, type Brand } from "@/lib/brands";
import type { Referral, LeadStage } from "@/lib/types";

// Referrals portal. Send a lead to another Experts Group business, set the
// fee you'll earn if it converts, and watch its progress. Referrals sent to
// your business arrive here — accept one and it drops into your Leads.

const STAGE_LABEL: Record<LeadStage, string> = {
  new: "New",
  attempt1: "Contact attempt 1",
  attempt2: "Contact attempt 2",
  attempt3: "Contact attempt 3",
  nurture: "Marketing funnel",
  converted: "Converted",
  pushed: "In CRM",
  lost: "Lost",
};

const STATUS_STYLE: Record<Referral["status"], string> = {
  pending: "bg-amber-50 text-amber-600",
  accepted: "bg-blue-50 text-blue-600",
  converted: "bg-green-50 text-green-600",
  paid: "bg-gray-900 text-white",
  declined: "bg-gray-100 text-gray-500",
};

function money(n: number) {
  return `£${n.toLocaleString("en-GB")}`;
}

export default function ReferralsPage() {
  const [brand, setBrand] = useState<Brand | null>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [tab, setTab] = useState<"received" | "sent">("received");
  const [showForm, setShowForm] = useState(false);
  const [open, setOpen] = useState<Referral | null>(null);
  const [toast, setToast] = useState("");

  // form state
  const [toBrandId, setToBrandId] = useState("");
  const [leadName, setLeadName] = useState("");
  const [leadPhone, setLeadPhone] = useState("");
  const [leadEmail, setLeadEmail] = useState("");
  const [note, setNote] = useState("");
  const [feeAmount, setFeeAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [formError, setFormError] = useState("");
  const [sending, setSending] = useState(false);

  async function reload() {
    setReferrals(await fetchReferrals());
  }

  useEffect(() => {
    const u = getUser();
    if (!u) return;
    setBrand(brandById(u.brandId) ?? null);
    reload();
  }, []);

  const visible = useMemo(
    () => referrals.filter((r) => r.direction === tab),
    [referrals, tab]
  );
  const receivedCount = referrals.filter((r) => r.direction === "received").length;
  const sentCount = referrals.filter((r) => r.direction === "sent").length;

  const otherBrands = BRANDS.filter((b) => b.id !== brand?.id);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  }

  async function submit() {
    if (!toBrandId || !leadName.trim()) {
      setFormError("Pick a business and enter the lead's name.");
      return;
    }
    setSending(true);
    setFormError("");
    const { error } = await sendReferral({
      toBrandId,
      leadName: leadName.trim(),
      leadPhone: leadPhone.trim(),
      leadEmail: leadEmail.trim(),
      note: note.trim(),
      feeAmount: Number(feeAmount) || 0,
      dueDate: dueDate || null,
    });
    setSending(false);
    if (error) {
      setFormError(error);
      return;
    }
    setShowForm(false);
    setToBrandId("");
    setLeadName("");
    setLeadPhone("");
    setLeadEmail("");
    setNote("");
    setFeeAmount("");
    setDueDate("");
    setTab("sent");
    await reload();
    flash(`Referral sent to ${brandById(toBrandId)?.name} ✓`);
  }

  async function act(
    r: Referral,
    action: "accept" | "decline" | "markPaid",
    successMsg: string
  ) {
    const updated = await actOnReferral(r.id, action);
    if (updated) {
      await reload();
      setOpen((cur) => (cur && cur.id === r.id ? updated : cur));
      flash(successMsg);
    }
  }

  if (!brand) return null;

  return (
    <div className="w-full">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Referrals</h1>
          <p className="mt-2 text-gray-500">
            Pass leads to other Experts Group businesses, earn a fee when they
            convert, and track every one.
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
              {t === "received" ? receivedCount : sentCount}
            </span>
          </button>
        ))}
      </div>

      {/* List */}
      <div className="mt-6 space-y-4">
        {visible.map((r) => {
          const other =
            tab === "received"
              ? brandById(r.fromBrandId)
              : brandById(r.toBrandId);
          return (
            <button
              key={r.id}
              onClick={() => setOpen(r)}
              className="block w-full rounded-2xl border border-gray-200 shadow-sm p-6 text-left transition hover:border-gray-300 hover:shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold">{r.leadName}</h3>
                    {r.status !== "pending" && r.status !== "declined" && (
                      <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                        {STAGE_LABEL[r.stage]}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-gray-500">
                    {[r.leadPhone, r.leadEmail].filter(Boolean).join(" · ") ||
                      "No contact details"}
                  </p>
                  <p className="mt-3 flex items-center gap-2 text-xs text-gray-400">
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: other?.accent }}
                    />
                    {tab === "received" ? "From" : "To"} {other?.name}
                    {tab === "received" && ` · ${r.fromName}`}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${STATUS_STYLE[r.status]}`}
                  >
                    {r.status}
                  </span>
                  <span className="text-sm font-semibold text-gray-900">
                    {money(r.feeAmount)}{" "}
                    <span className="text-xs font-normal text-gray-400">
                      fee
                    </span>
                  </span>
                </div>
              </div>
            </button>
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
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
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
              <Field label="Lead name">
                <input
                  className={inputCls}
                  value={leadName}
                  onChange={(e) => setLeadName(e.target.value)}
                  placeholder="Full name"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Contact number">
                  <input
                    className={inputCls}
                    value={leadPhone}
                    onChange={(e) => setLeadPhone(e.target.value)}
                    placeholder="07700 900000"
                  />
                </Field>
                <Field label="Email">
                  <input
                    className={inputCls}
                    value={leadEmail}
                    onChange={(e) => setLeadEmail(e.target.value)}
                    placeholder="name@email.com"
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Referral fee (£)">
                  <input
                    type="number"
                    min={0}
                    className={inputCls}
                    value={feeAmount}
                    onChange={(e) => setFeeAmount(e.target.value)}
                    placeholder="250"
                  />
                </Field>
                <Field label="Expected close">
                  <input
                    type="date"
                    className={inputCls}
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                </Field>
              </div>
              <Field label="Note (optional)">
                <textarea
                  className={`${inputCls} resize-none`}
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Any context that helps them close it"
                />
              </Field>
            </div>
            {formError && (
              <p className="mt-3 text-sm text-red-500">{formError}</p>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowForm(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={sending}
                className="rounded-lg px-5 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40"
                style={{ backgroundColor: brand.accent }}
              >
                {sending ? "Sending…" : "Send referral"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail drawer */}
      {open && (
        <ReferralDetail
          referral={open}
          viewerBrand={brand}
          onClose={() => setOpen(null)}
          onAct={act}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-gray-900 px-5 py-3 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-gray-900";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700">
        {label}
      </label>
      {children}
    </div>
  );
}

function ReferralDetail({
  referral: r,
  viewerBrand,
  onClose,
  onAct,
}: {
  referral: Referral;
  viewerBrand: Brand;
  onClose: () => void;
  onAct: (
    r: Referral,
    action: "accept" | "decline" | "markPaid",
    msg: string
  ) => void;
}) {
  const from = brandById(r.fromBrandId);
  const to = brandById(r.toBrandId);
  const isRecipient = r.direction === "received";

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-gray-900/30 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold">{r.leadName}</h2>
            <p className="mt-1 text-sm text-gray-500">
              {isRecipient
                ? `Referred to you by ${r.fromName}`
                : `You referred this to ${to?.name}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"
            aria-label="Close"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {/* Fee banner */}
        <div
          className="mt-5 rounded-2xl p-5 text-white"
          style={{ backgroundColor: viewerBrand.accent }}
        >
          <p className="text-sm text-white/70">
            {isRecipient ? "Referrer earns on conversion" : "You earn on conversion"}
          </p>
          <p className="mt-1 text-3xl font-semibold">{money(r.feeAmount)}</p>
          <p className="mt-1 text-sm text-white/70">
            {r.status === "paid"
              ? "Paid out ✓"
              : r.status === "converted"
                ? "Converted — fee now due"
                : "Payable once the deal completes"}
          </p>
        </div>

        {/* Details */}
        <dl className="mt-6 space-y-3 text-sm">
          <Row label="Status">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLE[r.status]}`}>
              {r.status}
            </span>
          </Row>
          {r.status !== "pending" && r.status !== "declined" && (
            <Row label="Progress">{STAGE_LABEL[r.stage]}</Row>
          )}
          <Row label="Phone">{r.leadPhone || "—"}</Row>
          <Row label="Email">{r.leadEmail || "—"}</Row>
          <Row label="Expected close">
            {r.dueDate
              ? new Date(r.dueDate).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })
              : "—"}
          </Row>
          <Row label={isRecipient ? "From" : "To"}>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: (isRecipient ? from : to)?.accent }}
              />
              {(isRecipient ? from : to)?.name}
            </span>
          </Row>
        </dl>

        {r.note && (
          <div className="mt-5 rounded-xl bg-gray-50 p-4 text-sm text-gray-600">
            “{r.note}”
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 flex flex-wrap gap-2">
          {isRecipient && r.status === "pending" && (
            <>
              <button
                onClick={() => onAct(r, "accept", `${r.leadName} added to your leads ✓`)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
                style={{ backgroundColor: viewerBrand.accent }}
              >
                Accept → add to leads
              </button>
              <button
                onClick={() => onAct(r, "decline", "Referral declined")}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-400 hover:bg-gray-50 hover:text-gray-600"
              >
                Decline
              </button>
            </>
          )}
          {isRecipient && r.status === "accepted" && (
            <p className="text-sm text-gray-500">
              Now in your <span className="font-medium">Leads</span> — work it
              through the funnel there and the referrer sees the progress.
            </p>
          )}
          {r.status === "converted" && (
            <button
              onClick={() => onAct(r, "markPaid", "Marked as paid out")}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
            >
              Mark fee paid
            </button>
          )}
        </div>

        {/* Activity */}
        <div className="mt-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
            Activity
          </p>
          <ol className="mt-3 space-y-3">
            {[...r.activity].reverse().map((a, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: viewerBrand.accent }}
                />
                <div>
                  <p className="text-gray-700">{a.text}</p>
                  <p className="text-xs text-gray-400">
                    {new Date(a.at).toLocaleString("en-GB")}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-gray-400">{label}</dt>
      <dd className="font-medium text-gray-800">{children}</dd>
    </div>
  );
}
