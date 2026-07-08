"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  getUser,
  fetchReferrals,
  sendReferral,
  actOnReferral,
} from "@/lib/session";
import { BRANDS, brandById, type Brand } from "@/lib/brands";
import type { Referral, LeadStage } from "@/lib/types";

// Referrals portal. The main area "advertises" every Experts Group business
// and the fee you earn for sending a lead its way — tap a business to learn
// more, then refer. Everything you've sent (and everything referred to you)
// lives in the rail on the right, where you can watch each one move down the
// pipeline: referred → accepted → converted → fee paid.

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

// ── Progress model ──────────────────────────────────────────────────────────
// The milestones we can honestly drive today from status + mirrored stage.
// Further granularity (on market / sold) will light up once the CRM feeds
// back — until then these four map exactly to what we track.
type Step = { label: string; done: boolean; current: boolean };

function journey(r: Referral, toBrand?: Brand): Step[] {
  if (r.status === "declined") {
    return [
      { label: "Referred", done: true, current: false },
      { label: "Declined", done: false, current: true },
    ];
  }
  const accepted = r.status !== "pending";
  const converted =
    r.status === "converted" ||
    r.status === "paid" ||
    r.stage === "converted" ||
    r.stage === "pushed";
  const paid = r.status === "paid";
  const raw = [
    { label: "Referred", done: true },
    { label: "Accepted", done: accepted },
    { label: toBrand?.conversionLabel ?? "Converted", done: converted },
    { label: "Fee paid", done: paid },
  ];
  const firstOpen = raw.findIndex((s) => !s.done);
  return raw.map((s, i) => ({
    ...s,
    current: firstOpen === -1 ? i === raw.length - 1 : i === firstOpen,
  }));
}

export default function ReferralsPage() {
  const [brand, setBrand] = useState<Brand | null>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [railTab, setRailTab] = useState<"sent" | "received">("sent");
  const [preview, setPreview] = useState<Brand | null>(null);
  const [formBrand, setFormBrand] = useState<Brand | null>(null);
  const [open, setOpen] = useState<Referral | null>(null);
  const [toast, setToast] = useState("");

  async function reload() {
    setReferrals(await fetchReferrals());
  }

  useEffect(() => {
    const u = getUser();
    if (!u) return;
    setBrand(brandById(u.brandId) ?? null);
    reload();
  }, []);

  const otherBrands = useMemo(
    () => BRANDS.filter((b) => b.id !== brand?.id),
    [brand]
  );
  const sent = referrals.filter((r) => r.direction === "sent");
  const received = referrals.filter((r) => r.direction === "received");
  const railItems = railTab === "sent" ? sent : received;

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
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

  function openPreview(b: Brand) {
    setPreview(b);
  }
  function startRefer(b: Brand) {
    setPreview(null);
    setFormBrand(b);
  }

  if (!brand) return null;

  return (
    <div className="w-full">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Refer &amp; earn</h1>
        <p className="mt-2 max-w-2xl text-gray-500">
          Every business in The Experts Group pays you for a lead that converts.
          Pick who you&apos;re sending someone to, see exactly what you&apos;ll
          earn, and track every referral all the way to your fee.
        </p>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
        {/* Advertisement grid */}
        <div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {otherBrands.map((b) => (
              <BrandTile key={b.id} brand={b} onOpen={() => openPreview(b)} />
            ))}
          </div>
        </div>

        {/* Rail */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-2xl border border-gray-200 shadow-sm">
            <div className="flex gap-1 p-1.5">
              {(["sent", "received"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setRailTab(t)}
                  className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium capitalize transition ${
                    railTab === t
                      ? "bg-gray-900 text-white"
                      : "text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  {t}
                  <span
                    className={`ml-1.5 text-xs ${
                      railTab === t ? "text-white/60" : "text-gray-400"
                    }`}
                  >
                    {t === "sent" ? sent.length : received.length}
                  </span>
                </button>
              ))}
            </div>
            <div className="max-h-[calc(100vh-11rem)] space-y-2.5 overflow-y-auto p-3 pt-1.5">
              {railItems.map((r) => (
                <RailCard
                  key={r.id}
                  referral={r}
                  viewerBrand={brand}
                  onClick={() => setOpen(r)}
                />
              ))}
              {railItems.length === 0 && (
                <div className="rounded-xl border border-dashed border-gray-200 py-12 text-center text-sm text-gray-400">
                  {railTab === "sent"
                    ? "Nothing sent yet — pick a business to refer into."
                    : "No referrals have come in yet."}
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      {preview && (
        <BrandPreview
          brand={preview}
          onClose={() => setPreview(null)}
          onRefer={() => startRefer(preview)}
        />
      )}

      {formBrand && (
        <ReferForm
          toBrand={formBrand}
          fromBrand={brand}
          onClose={() => setFormBrand(null)}
          onSent={async (name) => {
            setFormBrand(null);
            setRailTab("sent");
            await reload();
            flash(`Referral sent to ${name} ✓`);
          }}
        />
      )}

      {open && (
        <ReferralDetail
          referral={open}
          viewerBrand={brand}
          onClose={() => setOpen(null)}
          onAct={act}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-xl bg-gray-900 px-5 py-3 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

// ── Advertisement tile ──────────────────────────────────────────────────────
function BrandTile({ brand: b, onOpen }: { brand: Brand; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="group flex h-full flex-col rounded-2xl border border-gray-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md"
    >
      <div className="flex items-center gap-3">
        <BrandBadge brand={b} />
        <div className="min-w-0">
          <h3 className="truncate font-semibold leading-tight">{b.name}</h3>
          <p className="text-xs text-gray-400">{b.audience}</p>
        </div>
      </div>

      <p className="mt-4 text-sm leading-relaxed text-gray-500">
        {b.referralPitch}
      </p>

      <div className="mt-4 flex items-end justify-between border-t border-gray-100 pt-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
            You earn up to
          </p>
          <p
            className="text-2xl font-semibold tracking-tight"
            style={{ color: b.accent }}
          >
            {money(b.referralFee)}
          </p>
        </div>
        <span
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition group-hover:opacity-90"
          style={{ backgroundColor: b.accent }}
        >
          Refer a lead →
        </span>
      </div>
    </button>
  );
}

// Brand logo in a soft tinted rounded square, falling back to a letter mark.
function BrandBadge({ brand: b, size = 44 }: { brand: Brand; size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-xl"
      style={{ width: size, height: size, backgroundColor: b.accentSoft }}
    >
      <Image
        src={b.logo}
        alt={b.name}
        width={size - 12}
        height={size - 12}
        className="h-[70%] w-[70%] object-contain"
      />
    </div>
  );
}

// ── Preview modal ───────────────────────────────────────────────────────────
function BrandPreview({
  brand: b,
  onClose,
  onRefer,
}: {
  brand: Brand;
  onClose: () => void;
  onRefer: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/30 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header band in the brand colour */}
        <div
          className="flex items-center gap-4 p-6"
          style={{ backgroundColor: b.accentSoft }}
        >
          <BrandBadge brand={b} size={60} />
          <div>
            <h2 className="text-xl font-semibold">{b.name}</h2>
            <p className="text-sm text-gray-500">{b.audience}</p>
          </div>
        </div>

        <div className="p-6">
          <p className="text-sm leading-relaxed text-gray-600">
            {b.referralAbout}
          </p>

          {/* Fee card */}
          <div
            className="mt-5 rounded-2xl p-5 text-white"
            style={{ backgroundColor: b.accent }}
          >
            <p className="text-sm text-white/70">Your referral fee</p>
            <p className="mt-1 text-3xl font-semibold">{money(b.referralFee)}</p>
            <p className="mt-1 text-sm text-white/80">{b.referralFeeNote}</p>
          </div>

          <p className="mt-4 text-xs text-gray-400">
            Paid to you once the deal completes. You&apos;ll see it move through
            every stage in your sent list until the fee lands.
          </p>

          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50"
            >
              Close
            </button>
            <button
              onClick={onRefer}
              className="rounded-lg px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90"
              style={{ backgroundColor: b.accent }}
            >
              Refer a lead
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Refer form ──────────────────────────────────────────────────────────────
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

function ReferForm({
  toBrand,
  fromBrand,
  onClose,
  onSent,
}: {
  toBrand: Brand;
  fromBrand: Brand;
  onClose: () => void;
  onSent: (brandName: string) => void;
}) {
  const [leadName, setLeadName] = useState("");
  const [leadPhone, setLeadPhone] = useState("");
  const [leadEmail, setLeadEmail] = useState("");
  const [note, setNote] = useState("");
  const [feeAmount, setFeeAmount] = useState(String(toBrand.referralFee));
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  async function submit() {
    if (!leadName.trim()) {
      setError("Enter the lead's name.");
      return;
    }
    setSending(true);
    setError("");
    const { error } = await sendReferral({
      toBrandId: toBrand.id,
      leadName: leadName.trim(),
      leadPhone: leadPhone.trim(),
      leadEmail: leadEmail.trim(),
      note: note.trim(),
      feeAmount: Number(feeAmount) || 0,
      dueDate: dueDate || null,
    });
    setSending(false);
    if (error) {
      setError(error);
      return;
    }
    onSent(toBrand.name);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/30 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <BrandBadge brand={toBrand} size={40} />
          <div>
            <h2 className="text-lg font-semibold leading-tight">
              Refer to {toBrand.shortName}
            </h2>
            <p className="text-xs text-gray-400">
              You earn {money(toBrand.referralFee)} when it converts
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <Field label="Lead name">
            <input
              className={inputCls}
              value={leadName}
              onChange={(e) => setLeadName(e.target.value)}
              placeholder="Full name"
              autoFocus
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
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Any context that helps them close it"
            />
          </Field>
        </div>

        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={sending}
            className="rounded-lg px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
            style={{ backgroundColor: fromBrand.accent }}
          >
            {sending ? "Sending…" : "Send referral"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Rail card ───────────────────────────────────────────────────────────────
function RailCard({
  referral: r,
  viewerBrand,
  onClick,
}: {
  referral: Referral;
  viewerBrand: Brand;
  onClick: () => void;
}) {
  const other =
    r.direction === "received"
      ? brandById(r.fromBrandId)
      : brandById(r.toBrandId);
  const steps = journey(r, brandById(r.toBrandId));
  const accent = other?.accent ?? viewerBrand.accent;

  return (
    <button
      onClick={onClick}
      className="block w-full rounded-xl border border-gray-200 p-3.5 text-left transition hover:border-gray-300 hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{r.leadName}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-400">
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: accent }}
            />
            <span className="truncate">
              {r.direction === "received" ? "From" : "To"} {other?.shortName}
            </span>
          </p>
        </div>
        <span className="shrink-0 text-sm font-semibold text-gray-900">
          {money(r.feeAmount)}
        </span>
      </div>

      {/* Mini progress */}
      <div className="mt-3 flex items-center gap-1.5">
        {steps.map((s, i) => (
          <div
            key={i}
            className="h-1.5 flex-1 rounded-full"
            style={{
              backgroundColor: s.done ? accent : "#e5e7eb",
              opacity: s.done ? 1 : 1,
            }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex items-center justify-between">
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${STATUS_STYLE[r.status]}`}
        >
          {r.status}
        </span>
        <span className="text-[11px] text-gray-400">
          {[...steps].reverse().find((s) => s.done)?.label ?? steps[0]?.label}
        </span>
      </div>
    </button>
  );
}

// ── Detail drawer ───────────────────────────────────────────────────────────
function ReferralProgress({
  referral: r,
  toBrand,
  accent,
}: {
  referral: Referral;
  toBrand?: Brand;
  accent: string;
}) {
  const steps = journey(r, toBrand);
  return (
    <ol className="mt-2 space-y-0">
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        const declined = s.label === "Declined";
        return (
          <li key={i} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className="flex h-6 w-6 items-center justify-center rounded-full text-white"
                style={{
                  backgroundColor: s.done
                    ? accent
                    : declined
                      ? "#9ca3af"
                      : "#e5e7eb",
                }}
              >
                {s.done ? (
                  <svg
                    className="h-3.5 w-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={3}
                  >
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: declined ? "white" : "#9ca3af" }}
                  />
                )}
              </span>
              {!last && (
                <span
                  className="my-0.5 w-0.5 flex-1"
                  style={{ backgroundColor: s.done ? accent : "#e5e7eb" }}
                />
              )}
            </div>
            <div className={`pb-4 ${last ? "" : ""}`}>
              <p
                className={`text-sm ${
                  s.current
                    ? "font-semibold text-gray-900"
                    : s.done
                      ? "font-medium text-gray-700"
                      : "text-gray-400"
                }`}
              >
                {s.label}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
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
  const other = isRecipient ? from : to;
  const accent = other?.accent ?? viewerBrand.accent;

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
          <div className="flex items-center gap-3">
            {other && <BrandBadge brand={other} size={40} />}
            <div>
              <h2 className="text-xl font-semibold leading-tight">
                {r.leadName}
              </h2>
              <p className="mt-0.5 text-sm text-gray-500">
                {isRecipient
                  ? `Referred to you by ${r.fromName}`
                  : `You referred this to ${to?.name}`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"
            aria-label="Close"
          >
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {/* Fee banner */}
        <div
          className="mt-5 rounded-2xl p-5 text-white"
          style={{ backgroundColor: accent }}
        >
          <p className="text-sm text-white/70">
            {isRecipient
              ? "Referrer earns on conversion"
              : "You earn on conversion"}
          </p>
          <p className="mt-1 text-3xl font-semibold">{money(r.feeAmount)}</p>
          <p className="mt-1 text-sm text-white/80">
            {r.status === "paid"
              ? "Paid out ✓"
              : r.status === "converted"
                ? "Converted — fee now due"
                : "Payable once the deal completes"}
          </p>
        </div>

        {/* Progress pipeline */}
        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
            Progress
          </p>
          <ReferralProgress referral={r} toBrand={to} accent={accent} />
          <p className="-mt-1 text-xs text-gray-400">
            Updates flow both ways as {to?.shortName ?? "the team"} works the
            lead through their system.
          </p>
        </div>

        {/* Details */}
        <dl className="mt-6 space-y-3 text-sm">
          <Row label="Status">
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLE[r.status]}`}
            >
              {r.status}
            </span>
          </Row>
          {r.status !== "pending" && r.status !== "declined" && (
            <Row label="Stage">{STAGE_LABEL[r.stage]}</Row>
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
        </dl>

        {r.note && (
          <div className="mt-5 rounded-xl bg-gray-50 p-4 text-sm text-gray-600">
            &ldquo;{r.note}&rdquo;
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 flex flex-wrap gap-2">
          {isRecipient && r.status === "pending" && (
            <>
              <button
                onClick={() =>
                  onAct(r, "accept", `${r.leadName} added to your leads ✓`)
                }
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
                  style={{ backgroundColor: accent }}
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
