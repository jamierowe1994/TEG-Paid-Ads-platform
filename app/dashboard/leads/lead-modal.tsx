"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { Lead, LeadStage } from "@/lib/types";
import type { Brand } from "@/lib/brands";
import SourceIcon from "@/components/SourceIcon";

export function stageLabel(stage: LeadStage, brand: Brand): string {
  switch (stage) {
    case "new":
      return "New";
    case "attempt1":
      return "Attempt 1";
    case "attempt2":
      return "Attempt 2";
    case "attempt3":
      return "Attempt 3";
    case "nurture":
      return "Marketing funnel";
    case "converted":
      return brand.conversionLabel;
    case "pushed":
      return `In ${brand.crmName}`;
    case "lost":
      return "Lost";
  }
}

export function whatFor(lead: Lead): string {
  return lead.interestedIn?.trim() || lead.note?.trim() || "Enquiry";
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

function fullDate(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// GIFs for the mark-as-lost screens (in public/images). Leave blank to fall
// back to the animated emoji.
const LOST_GIF = "/images/Sad%20Michael%20Scott%20GIF.gif";
const FUNNEL_GIF = "/images/Leonardo%20Dicaprio%20Kinda%20GIF.gif";

// Why a lead was marked lost — captured so we can learn from it.
const LOST_REASONS = [
  "Couldn't make contact",
  "Not the right time",
  "Just thinking about it / later",
  "Went with someone else",
  "Budget / price",
  "Not interested",
  "Other",
];

// Timing-related reasons aren't really losses — they're "not yet". These
// offer a comeback date instead: the file is archived and resurfaces as a
// new lead when that date arrives.
const TIMING_REASONS = new Set([
  "Not the right time",
  "Just thinking about it / later",
  "Budget / price",
]);

function GifCard({
  src,
  emoji,
  tint,
}: {
  src: string;
  emoji: string;
  tint: string;
}) {
  return (
    <div
      className="flex aspect-[16/10] w-full items-center justify-center overflow-hidden rounded-2xl"
      style={{ background: tint }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="animate-bounce text-7xl">{emoji}</span>
      )}
    </div>
  );
}

// Format a booked appointment date nicely.
function apptLabel(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Lead detail modal (exported so the overview can pop it too) ───────────
export function LeadModal({
  lead,
  brand,
  pushing,
  onClose,
  onStage,
  onPush,
  onAddNote,
  onBook,
  onCancelBooking,
  onRexReset,
  onArchive,
  onSnooze,
  emailConnected,
  onSendEmail,
}: {
  lead: Lead;
  brand: Brand;
  pushing: boolean;
  onClose: () => void;
  onStage: (stage: LeadStage) => void;
  onPush: () => void;
  onAddNote: (text: string) => Promise<void>;
  onBook: (at: string) => Promise<void>;
  onCancelBooking: () => Promise<void>;
  // "They've been deleted in REX" — verify with Rex and reset the file if so.
  onRexReset?: () => Promise<void>;
  // Archive / unarchive this file (never deletes).
  onArchive?: (archived: boolean) => Promise<void>;
  // "Save for a later date" — archive with a comeback date.
  onSnooze?: (until: string, reason: string) => Promise<void>;
  // Real email sending (Microsoft mailbox connected) — absent/false keeps
  // the draft-only behaviour.
  emailConnected?: boolean;
  onSendEmail?: (
    subject: string,
    body: string
  ) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [showTimeline, setShowTimeline] = useState(false);
  const [lostStep, setLostStep] = useState<
    null | "ask" | "reason" | "date" | "funnel" | "done"
  >(null);
  const [savingLost, setSavingLost] = useState(false);
  const [lostReason, setLostReason] = useState("");
  const [snoozeDay, setSnoozeDay] = useState<Date | null>(null);
  const [savingSnooze, setSavingSnooze] = useState(false);
  const [archivingFile, setArchivingFile] = useState(false);
  const [panel, setPanel] = useState<null | "call" | "email">(null);
  const [callTab, setCallTab] = useState<"notes" | "schedule">("notes");
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const apptDate = lead.appointmentAt ? new Date(lead.appointmentAt) : null;
  const [calOpen, setCalOpen] = useState(false);
  const [pickedDay, setPickedDay] = useState<Date | null>(
    apptDate
      ? new Date(apptDate.getFullYear(), apptDate.getMonth(), apptDate.getDate())
      : null
  );
  const [pickedTime, setPickedTime] = useState(
    apptDate
      ? `${String(apptDate.getHours()).padStart(2, "0")}:${String(
          apptDate.getMinutes()
        ).padStart(2, "0")}`
      : ""
  );
  const [booking, setBooking] = useState(false);
  const [resettingRex, setResettingRex] = useState(false);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [emailToast, setEmailToast] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  // The agent's own saved email templates (personal, per browser). `{name}`
  // in a template is swapped for the lead's first name when applied.
  const [customTemplates, setCustomTemplates] = useState<
    { id: string; name: string; subject: string; body: string }[]
  >([]);
  const [namingTemplate, setNamingTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");
  useEffect(() => {
    try {
      const raw = localStorage.getItem("teg-email-templates");
      if (raw) setCustomTemplates(JSON.parse(raw));
    } catch {
      /* no saved templates yet */
    }
  }, []);
  function persistTemplates(
    next: { id: string; name: string; subject: string; body: string }[]
  ) {
    setCustomTemplates(next);
    try {
      localStorage.setItem("teg-email-templates", JSON.stringify(next.slice(-30)));
    } catch {
      /* storage blocked — templates just won't persist */
    }
  }

  const firstName = lead.name.split(" ")[0] || "there";
  const events = [
    { label: "Lead received", at: lead.receivedAt },
    ...lead.history.map((h) => ({
      label: h.label ?? stageLabel(h.stage, brand),
      at: h.at,
    })),
  ];
  const latest = events[events.length - 1];
  const notes = lead.notes ?? [];
  const booked = !!lead.appointmentAt;

  const canWork = !["pushed", "lost"].includes(lead.stage);
  const attemptNext: Partial<Record<LeadStage, LeadStage>> = {
    new: "attempt1",
    attempt1: "attempt2",
    attempt2: "attempt3",
  };

  const EMAIL_TEMPLATES = [
    {
      name: "First touch",
      subject: "Following up on your enquiry",
      body: `Hi ${firstName},\n\nThanks for getting in touch — I'd love to help. When's a good time for a quick chat this week?\n\nBest,`,
    },
    {
      name: "Chasing a reply",
      subject: "Still happy to help",
      body: `Hi ${firstName},\n\nJust circling back on my last message — I'm around if you have any questions. Would a quick call suit?\n\nBest,`,
    },
    {
      name: "Confirm appointment",
      subject: "Your appointment is booked",
      body: `Hi ${firstName},\n\nGreat news — you're booked in${
        lead.appointmentAt ? ` for ${apptLabel(lead.appointmentAt)}` : ""
      }. I'll be in touch to confirm the details. Looking forward to it!\n\nBest,`,
    },
  ];

  function togglePanel(which: "call" | "email") {
    setPanel((p) => (p === which ? null : which));
  }

  // Apply a template's subject/body, swapping {name} for the lead's first
  // name so a saved template personalises itself for each lead.
  function applyTemplate(subject: string, body: string) {
    const fill = (s: string) => s.replace(/\{name\}/g, firstName);
    setEmailSubject(fill(subject));
    setEmailBody(fill(body));
  }

  // Save the current subject/body as a reusable template. The lead's first
  // name is turned back into the {name} token so it generalises.
  function saveTemplate() {
    const name = templateName.trim();
    if (!name || !emailSubject.trim() || !emailBody.trim()) return;
    const generalise = (s: string) =>
      firstName && firstName !== "there"
        ? s.split(firstName).join("{name}")
        : s;
    persistTemplates([
      ...customTemplates,
      {
        id: Math.random().toString(36).slice(2, 9),
        name,
        subject: generalise(emailSubject.trim()),
        body: generalise(emailBody.trim()),
      },
    ]);
    setTemplateName("");
    setNamingTemplate(false);
  }

  async function sendEmail() {
    if (!emailSubject.trim() || !emailBody.trim() || sendingEmail) return;
    // Until the mailbox is connected, keep the draft and point at the setup.
    if (!emailConnected || !onSendEmail) {
      setEmailToast(
        "Draft ready ✓ — connect your email (Profile → Email sending) to send from here."
      );
      setTimeout(() => setEmailToast(""), 5000);
      return;
    }
    setSendingEmail(true);
    const res = await onSendEmail(emailSubject.trim(), emailBody.trim());
    setSendingEmail(false);
    if (res.ok) {
      // Show the tick, then collapse the whole panel closed.
      setEmailSubject("");
      setEmailBody("");
      setEmailSent(true);
      setTimeout(() => {
        setEmailSent(false);
        setPanel(null);
      }, 1800);
    } else {
      setEmailToast(res.error ?? "Couldn't send — please try again.");
      setTimeout(() => setEmailToast(""), 6000);
    }
  }

  async function saveNote() {
    if (!noteText.trim() || savingNote) return;
    setSavingNote(true);
    await onAddNote(noteText.trim());
    setSavingNote(false);
    setNoteText("");
  }

  async function confirmBooking() {
    if (!pickedDay || !pickedTime || booking) return;
    const [h, m] = pickedTime.split(":").map(Number);
    const dt = new Date(pickedDay);
    dt.setHours(h, m, 0, 0);
    setBooking(true);
    await onBook(dt.toISOString());
    setBooking(false);
  }

  // Record why the lead was lost (as a note) and mark it lost.
  async function markLostWithReason(reason: string) {
    if (savingLost) return;
    setSavingLost(true);
    await onAddNote(`Marked lost — ${reason}`);
    onStage("lost");
    setSavingLost(false);
    onClose();
  }

  // A timing reason + a date = not lost at all: saved for later. Picking
  // today lands an hour from now rather than being rejected as "in the past".
  async function saveForLater(until: Date) {
    if (!onSnooze || savingSnooze) return;
    const d = new Date(until);
    if (d.getTime() <= Date.now()) d.setTime(Date.now() + 60 * 60 * 1000);
    setSavingSnooze(true);
    await onSnooze(d.toISOString(), lostReason || "Not the right time");
    setSavingSnooze(false);
  }

  function monthsFromNow(n: number): Date {
    const d = new Date();
    d.setMonth(d.getMonth() + n);
    d.setHours(9, 0, 0, 0);
    return d;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/50 p-0 sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="modal-pop relative max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl bg-white p-6 sm:rounded-3xl sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <SourceIcon source={lead.source} size={20} />
              <h2 className="text-xl font-semibold">{lead.name}</h2>
              {/* Already on the brand's CRM — from the duplicate check or a push */}
              {(lead.crmMatch?.found || lead.rexContactId) && (
                <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700">
                  On {brand.crmName}
                </span>
              )}
              {lead.archivedAt && (
                <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-semibold text-gray-500">
                  {lead.resurfaceAt
                    ? `Back ${shortDate(lead.resurfaceAt)}`
                    : "Archived"}
                </span>
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-gray-400">
              {lead.adName && <span>{lead.adName} · </span>}
              <span>{shortDate(lead.receivedAt)}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {/* Interested in */}
        <div className="mt-4 rounded-2xl bg-gray-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
            Interested in
          </p>
          <p className="mt-1 text-sm text-gray-800">{whatFor(lead)}</p>
        </div>

        {/* Contact — Call / Email toggle their own panels */}
        <div className="mt-3 grid grid-cols-2 gap-3">
          <button
            onClick={() => togglePanel("call")}
            className={`flex items-center justify-center gap-2 rounded-2xl border py-3 text-sm font-medium transition ${
              panel === "call"
                ? "border-gray-900 bg-gray-900 text-white"
                : "border-gray-200 text-gray-700 shadow-sm hover:bg-gray-50"
            }`}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
            </svg>
            Call
          </button>
          <button
            onClick={() => togglePanel("email")}
            className={`flex items-center justify-center gap-2 rounded-2xl border py-3 text-sm font-medium transition ${
              panel === "email"
                ? "border-gray-900 bg-gray-900 text-white"
                : "border-gray-200 text-gray-700 shadow-sm hover:bg-gray-50"
            }`}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
            </svg>
            Email
          </button>
        </div>

        {/* Call panel — sweeps open with Notes / Schedule tabs */}
        <Expand open={panel === "call"}>
          <div className="mt-3 rounded-2xl border border-gray-200 p-5">
            <a
              href={`tel:${lead.phone}`}
              className="inline-flex items-center gap-1.5 text-sm font-medium"
              style={{ color: brand.accent }}
            >
              📞 {lead.phone}
            </a>
            <div className="mt-4 flex gap-1 rounded-xl bg-gray-100 p-1 text-sm">
              {(["notes", "schedule"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setCallTab(t)}
                  className={`flex-1 rounded-lg py-2 font-medium capitalize transition ${
                    callTab === t ? "bg-white shadow-sm" : "text-gray-500"
                  }`}
                >
                  {t === "notes" ? "Add notes" : "Schedule a call"}
                </button>
              ))}
            </div>

            {callTab === "notes" ? (
              <div className="mt-4">
                {notes.length > 0 && (
                  <ul className="mb-4 space-y-2.5">
                    {[...notes].reverse().map((n, i) => (
                      <li key={i} className="rounded-xl bg-gray-50 p-3.5 text-sm text-gray-700">
                        {n.text}
                        <span className="mt-1.5 block text-[11px] text-gray-400">
                          {fullDate(n.at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  rows={5}
                  placeholder="Log a call, jot a reminder…"
                  className="w-full rounded-xl border border-gray-200 p-3.5 text-sm outline-none focus:border-gray-900"
                />
                <div className="mt-3">
                  <BigBtn
                    primary
                    accent={brand.accent}
                    disabled={!noteText.trim() || savingNote}
                    onClick={saveNote}
                  >
                    {savingNote ? "Saving…" : "Save note"}
                  </BigBtn>
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                {booked && (
                  <p className="rounded-xl bg-green-50 p-3.5 text-sm font-medium text-green-700">
                    📅 Booked for {apptLabel(lead.appointmentAt!)}
                  </p>
                )}
                {/* Date field — clicking drops down a full inline calendar */}
                <div>
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">
                    Date
                  </label>
                  <button
                    onClick={() => setCalOpen((v) => !v)}
                    className="flex w-full items-center justify-between rounded-xl border border-gray-200 p-3.5 text-sm transition hover:border-gray-900"
                  >
                    <span className={pickedDay ? "text-gray-900" : "text-gray-400"}>
                      {pickedDay
                        ? pickedDay.toLocaleDateString("en-GB", {
                            weekday: "short",
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          })
                        : "Pick a date"}
                    </span>
                    <svg
                      viewBox="0 0 24 24"
                      className={`h-4 w-4 text-gray-400 transition-transform ${calOpen ? "rotate-180" : ""}`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                  <Expand open={calOpen}>
                    <div className="pt-2">
                      <InlineCalendar
                        value={pickedDay}
                        accent={brand.accent}
                        onPick={(d) => {
                          setPickedDay(d);
                          setCalOpen(false);
                        }}
                      />
                    </div>
                  </Expand>
                </div>

                {/* Time — a full-width hour slider, then 15-minute pills */}
                {pickedDay && (
                  <TimePicker
                    value={pickedTime}
                    accent={brand.accent}
                    onChange={setPickedTime}
                  />
                )}

                <BigBtn
                  primary
                  accent={brand.accent}
                  disabled={!pickedDay || !pickedTime || booking}
                  onClick={confirmBooking}
                >
                  {booking ? "Saving…" : booked ? "Rearrange" : "Book it in"}
                </BigBtn>
                {booked && (
                  <button
                    onClick={onCancelBooking}
                    className="w-full rounded-2xl py-2.5 text-sm font-medium text-gray-400 hover:bg-gray-50 hover:text-gray-600"
                  >
                    Cancel booking
                  </button>
                )}
              </div>
            )}
          </div>
        </Expand>

        {/* Email panel — dark-grey card matching the sign-up process, so the
            whole modal reads as one system. */}
        <Expand open={panel === "email"}>
          <div
            className={`mt-3 overflow-hidden rounded-2xl bg-neutral-800 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.07),inset_0_0_34px_rgba(0,0,0,0.4)] transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              emailSent ? "p-0" : "p-4"
            }`}
          >
            {emailSent ? (
              // Sent confirmation — pops in, holds, then the panel slides shut.
              <div className="flex flex-col items-center justify-center gap-2 py-7 text-center">
                <div className="flex h-14 w-14 animate-[tick-pop_0.5s_cubic-bezier(0.22,1,0.36,1)] items-center justify-center rounded-full bg-green-500/20 text-2xl text-green-400">
                  ✓
                </div>
                <p className="fade-up font-semibold text-white">Sent</p>
                <p className="fade-up text-xs text-white/50">
                  It&apos;s in your own Sent items too.
                </p>
              </div>
            ) : (
              <>
                <p className="text-sm font-medium text-white/80">
                  ✉ <span className="text-white/50">{lead.email}</span>
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {EMAIL_TEMPLATES.map((t) => (
                    <button
                      key={t.name}
                      onClick={() => applyTemplate(t.subject, t.body)}
                      className="rounded-full border border-white/20 px-3 py-1 text-xs font-medium text-white/70 transition hover:bg-white/10"
                    >
                      {t.name}
                    </button>
                  ))}
                  {/* The agent's own saved templates — click to use, × to remove */}
                  {customTemplates.map((t) => (
                    <span
                      key={t.id}
                      className="group inline-flex items-center gap-1 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-medium text-white"
                    >
                      <button onClick={() => applyTemplate(t.subject, t.body)}>
                        {t.name}
                      </button>
                      <button
                        onClick={() =>
                          persistTemplates(
                            customTemplates.filter((x) => x.id !== t.id)
                          )
                        }
                        aria-label={`Delete ${t.name} template`}
                        className="text-white/40 opacity-60 transition group-hover:opacity-100 hover:text-red-400"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
                <input
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  placeholder="Subject"
                  className="mt-3 w-full rounded-xl border border-white/15 bg-white/5 p-3 text-sm text-white outline-none placeholder:text-white/40 focus:border-white/40"
                />
                <textarea
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  rows={6}
                  placeholder="Write your email, or pick a template above…"
                  className="mt-2 w-full rounded-xl border border-white/15 bg-white/5 p-3 text-sm text-white outline-none placeholder:text-white/40 focus:border-white/40"
                />

                {/* Save the current draft as a reusable template */}
                {namingTemplate ? (
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      autoFocus
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && saveTemplate()}
                      placeholder="Template name (e.g. Valuation follow-up)"
                      className="flex-1 rounded-xl border border-white/15 bg-white/5 p-2.5 text-xs text-white outline-none placeholder:text-white/40 focus:border-white/40"
                    />
                    <button
                      onClick={saveTemplate}
                      disabled={!templateName.trim()}
                      className="rounded-xl px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-40"
                      style={{ backgroundColor: brand.accent }}
                    >
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setNamingTemplate(false);
                        setTemplateName("");
                      }}
                      className="rounded-xl px-2 py-2.5 text-xs font-medium text-white/50 hover:text-white/80"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  emailSubject.trim() &&
                  emailBody.trim() && (
                    <button
                      onClick={() => setNamingTemplate(true)}
                      className="mt-2 text-xs font-medium text-white/50 underline decoration-dotted underline-offset-2 hover:text-white/80"
                    >
                      ＋ Save as a template
                    </button>
                  )
                )}

                <div className="mt-3">
                  <BigBtn
                    primary
                    accent={brand.accent}
                    disabled={
                      !emailSubject.trim() || !emailBody.trim() || sendingEmail
                    }
                    onClick={sendEmail}
                  >
                    {sendingEmail ? "Sending…" : "Send email"}
                  </BigBtn>
                </div>
                {emailToast && (
                  <p className="mt-2 text-center text-xs text-white/60">
                    {emailToast}
                  </p>
                )}
              </>
            )}
          </div>
        </Expand>

        {/* Timeline — latest only, expandable */}
        <div className="mt-4 rounded-2xl border border-gray-200 shadow-sm p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                Latest
              </p>
              <p className="mt-1 text-sm text-gray-800">
                {latest.label}{" "}
                <span className="text-gray-400">· {fullDate(latest.at)}</span>
              </p>
            </div>
            {events.length > 1 && (
              <button
                onClick={() => setShowTimeline((v) => !v)}
                className="text-xs font-medium text-gray-500 hover:text-gray-800"
              >
                {showTimeline ? "Hide" : "Timeline"}
              </button>
            )}
          </div>
          {showTimeline && (
            <ol className="mt-3 space-y-2 border-t border-gray-100 pt-3">
              {[...events].reverse().map((e, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: i === 0 ? brand.accent : "#D1D5DB" }}
                  />
                  <span className="text-gray-700">{e.label}</span>
                  <span className="ml-auto text-xs text-gray-400">
                    {fullDate(e.at)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* Next step — the one obvious action */}
        <div className="mt-5">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
            Next step
          </p>
          <div className="mt-2 space-y-2">
            {/* Log the next contact attempt */}
            {attemptNext[lead.stage] && (
              <BigBtn onClick={() => onStage(attemptNext[lead.stage]!)}>
                Log contact attempt{" "}
                {lead.stage === "new" ? "1" : lead.stage === "attempt1" ? "2" : "3"}
              </BigBtn>
            )}

            {/* After 3 attempts, offer the marketing funnel */}
            {lead.stage === "attempt3" && (
              <BigBtn onClick={() => onStage("nurture")}>
                No answer — send to marketing funnel
              </BigBtn>
            )}

            {/* Book the appointment — opens the schedule tab to pick a date */}
            {canWork && lead.stage !== "converted" && (
              <BigBtn
                primary
                accent={brand.accent}
                onClick={() => {
                  setPanel("call");
                  setCallTab("schedule");
                }}
              >
                {brand.conversionVerb}
              </BigBtn>
            )}

            {/* Booked → summary + push, with manage (rearrange/cancel) */}
            {lead.stage === "converted" && (
              <>
                {booked && (
                  <p className="rounded-2xl bg-green-50 py-3 text-center text-sm font-medium text-green-700">
                    📅 Booked for {apptLabel(lead.appointmentAt!)}
                  </p>
                )}
                <BigBtn primary accent={brand.accent} disabled={pushing} onClick={onPush}>
                  {pushing ? "Pushing…" : `Push to ${brand.crmName}`}
                </BigBtn>
                <BigBtn
                  onClick={() => {
                    setPanel("call");
                    setCallTab("schedule");
                  }}
                >
                  {booked ? "Rearrange or cancel" : "Set a date"}
                </BigBtn>
              </>
            )}

            {lead.stage === "pushed" && (
              <>
                <p className="rounded-2xl bg-green-50 py-3 text-center text-sm font-medium text-green-700">
                  ✓ In {brand.crmName}
                  {booked ? ` · ${apptLabel(lead.appointmentAt!)}` : ""}
                </p>
                {/* Verifies with Rex first — only resets the file if the
                    person is genuinely gone there. The reset drops the lead
                    back to converted (with a timeline entry recording the
                    deletion) so the normal push action returns. */}
                {onRexReset && brand.crmName === "REX" && (
                  <button
                    onClick={async () => {
                      if (resettingRex) return;
                      setResettingRex(true);
                      await onRexReset();
                      setResettingRex(false);
                    }}
                    disabled={resettingRex}
                    className="w-full rounded-2xl border border-transparent py-2.5 text-sm font-medium text-gray-400 transition hover:border-gray-300 hover:text-gray-600 disabled:opacity-50"
                  >
                    {resettingRex
                      ? "Checking REX…"
                      : `Deleted them in ${brand.crmName}? Reset the file`}
                  </button>
                )}
              </>
            )}

            {/* Mark lost / reopen */}
            {canWork && !lead.archivedAt && (
              <button
                onClick={() => setLostStep("ask")}
                className="w-full rounded-2xl border border-transparent py-2.5 text-sm font-medium text-gray-400 transition hover:border-gray-300 hover:text-gray-600"
              >
                Mark as lost
              </button>
            )}
            {lead.stage === "lost" && !lead.archivedAt && (
              <BigBtn onClick={() => onStage("new")}>Reopen lead</BigBtn>
            )}

            {/* Archive — file it away (done/lost leads), or bring it back */}
            {onArchive && lead.archivedAt && (
              <BigBtn
                disabled={archivingFile}
                onClick={async () => {
                  setArchivingFile(true);
                  await onArchive(false);
                  setArchivingFile(false);
                }}
              >
                {archivingFile
                  ? "Restoring…"
                  : lead.resurfaceAt
                    ? "Bring back now (don't wait)"
                    : "Bring back to the funnel"}
              </BigBtn>
            )}
            {onArchive &&
              !lead.archivedAt &&
              (lead.stage === "pushed" || lead.stage === "lost") && (
                <button
                  disabled={archivingFile}
                  onClick={async () => {
                    setArchivingFile(true);
                    await onArchive(true);
                    setArchivingFile(false);
                  }}
                  className="w-full rounded-2xl border border-transparent py-2.5 text-sm font-medium text-gray-400 transition hover:border-gray-300 hover:text-gray-600 disabled:opacity-50"
                >
                  {archivingFile ? "Archiving…" : "Archive this file"}
                </button>
              )}
          </div>
        </div>

        {/* Mark-as-lost flow — swipes over the modal: sad → funnel → done */}
        {lostStep && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/50 p-4"
            onClick={() => setLostStep(null)}
          >
            <div
              className="relative w-full max-w-md rounded-3xl bg-white p-6 sm:p-7"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setLostStep(null)}
                className="absolute right-5 top-5 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="Cancel"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
              <div
                key={lostStep}
                className="animate-[lost-slide_0.35s_cubic-bezier(0.22,1,0.36,1)]"
              >
              {lostStep === "ask" && (
                <>
                  <GifCard
                    src={LOST_GIF}
                    emoji="🥲"
                    tint="linear-gradient(135deg,#fef2f2,#fee2e2)"
                  />
                  <h3 className="mt-5 text-center text-xl font-semibold">
                    One that got away?
                  </h3>
                  <p className="mt-2 text-center text-sm text-gray-500">
                    Don't close the door just yet — want to keep {firstName}{" "}
                    warm with our marketing follow-ups?
                  </p>
                  <p className="mt-4 text-center text-sm font-medium text-gray-800">
                    Add {firstName} to a marketing funnel?
                  </p>
                  <div className="mt-4 space-y-2">
                    <BigBtn
                      primary
                      accent={brand.accent}
                      onClick={() => setLostStep("funnel")}
                    >
                      Yes, add to marketing funnel
                    </BigBtn>
                    <button
                      onClick={() => setLostStep("reason")}
                      className="w-full rounded-2xl py-2.5 text-sm font-medium text-gray-400 hover:text-gray-600"
                    >
                      No, just mark it lost
                    </button>
                  </div>
                </>
              )}
              {lostStep === "reason" && (
                <>
                  <h3 className="text-center text-xl font-semibold">
                    What happened with {firstName}?
                  </h3>
                  <p className="mt-2 text-center text-sm text-gray-500">
                    A quick reason helps us learn what's converting and what
                    isn't.
                  </p>
                  <div className="mt-5 space-y-2">
                    {LOST_REASONS.map((reason) => (
                      <button
                        key={reason}
                        disabled={savingLost}
                        onClick={() => {
                          // Timing reasons aren't losses — offer a comeback
                          // date instead of closing the door.
                          if (onSnooze && TIMING_REASONS.has(reason)) {
                            setLostReason(reason);
                            setLostStep("date");
                          } else {
                            markLostWithReason(reason);
                          }
                        }}
                        className="flex w-full items-center justify-between rounded-2xl border border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-700 transition hover:border-gray-900 hover:bg-gray-50 disabled:opacity-50"
                      >
                        {reason}
                        <span className="text-gray-300">→</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
              {lostStep === "date" && (
                <>
                  <h3 className="text-center text-xl font-semibold">
                    Sounds like a &quot;not yet&quot;, not a no
                  </h3>
                  <p className="mt-2 text-center text-sm text-gray-500">
                    Pick when {firstName} said they&apos;d be ready — we&apos;ll
                    file this away and bring it back as a new lead on that day,
                    ping included.
                  </p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {[
                      { label: "In 1 month", months: 1 },
                      { label: "In 3 months", months: 3 },
                      { label: "In 6 months", months: 6 },
                    ].map((p) => (
                      <button
                        key={p.label}
                        disabled={savingSnooze}
                        onClick={() => saveForLater(monthsFromNow(p.months))}
                        className="rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:border-gray-900 hover:bg-gray-50 disabled:opacity-50"
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <div className="mt-4">
                    <InlineCalendar
                      value={snoozeDay}
                      accent={brand.accent}
                      onPick={(d) => {
                        const dt = new Date(d);
                        dt.setHours(9, 0, 0, 0);
                        setSnoozeDay(dt);
                        saveForLater(dt);
                      }}
                    />
                  </div>
                  {savingSnooze && (
                    <p className="mt-3 text-center text-sm text-gray-400">
                      Saving…
                    </p>
                  )}
                  <button
                    disabled={savingLost || savingSnooze}
                    onClick={() => markLostWithReason(lostReason || "Not the right time")}
                    className="mt-3 w-full rounded-2xl py-2.5 text-sm font-medium text-gray-400 hover:text-gray-600 disabled:opacity-50"
                  >
                    No date — just mark it lost
                  </button>
                </>
              )}
              {lostStep === "funnel" && (
                <>
                  <GifCard
                    src={FUNNEL_GIF}
                    emoji="🙌"
                    tint="linear-gradient(135deg,#f0fdf4,#dcfce7)"
                  />
                  <h3 className="mt-5 text-center text-xl font-semibold">
                    Not lost — just nurtured
                  </h3>
                  <p className="mt-2 text-center text-sm text-gray-500">
                    {firstName} will get our marketing sequence and could come
                    back around when the timing's right.
                  </p>
                  <div className="mt-5">
                    <BigBtn
                      primary
                      accent={brand.accent}
                      onClick={() => {
                        onStage("nurture");
                        setLostStep("done");
                        setTimeout(onClose, 1600);
                      }}
                    >
                      Add them ✓
                    </BigBtn>
                  </div>
                </>
              )}
              {lostStep === "done" && (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="flex h-16 w-16 animate-[lost-slide_0.4s_ease] items-center justify-center rounded-full bg-green-100 text-3xl text-green-600">
                    ✓
                  </div>
                  <p className="mt-4 text-center font-medium">
                    Added to your mailing list
                  </p>
                </div>
              )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Time picker — a full-width landscape slider for the hour (business hours),
// then 15-minute increment pills. Much friendlier than the native time input.
function TimePicker({
  value,
  accent,
  onChange,
}: {
  value: string;
  accent: string;
  onChange: (t: string) => void;
}) {
  const START_HOUR = 7;
  const END_HOUR = 20; // 7am–8pm covers viewings/calls
  const [h, m] = value ? value.split(":").map(Number) : [9, 0];
  const hour = Number.isFinite(h) ? Math.min(END_HOUR, Math.max(START_HOUR, h)) : 9;
  const minute = [0, 15, 30, 45].includes(m) ? m : 0;

  const set = (nextH: number, nextM: number) =>
    onChange(
      `${String(nextH).padStart(2, "0")}:${String(nextM).padStart(2, "0")}`
    );

  // Commit the default so "Book it in" enables without needing a nudge.
  useEffect(() => {
    if (!value) set(hour, minute);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const label = (() => {
    const suffix = hour < 12 ? "am" : "pm";
    const h12 = hour % 12 === 0 ? 12 : hour % 12;
    return `${h12}:${String(minute).padStart(2, "0")} ${suffix}`;
  })();

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <label className="text-xs font-medium uppercase tracking-wide text-gray-400">
          Time
        </label>
        <span className="text-lg font-semibold" style={{ color: accent }}>
          {label}
        </span>
      </div>
      {/* Hour slider — full width */}
      <input
        type="range"
        min={START_HOUR}
        max={END_HOUR}
        step={1}
        value={hour}
        onChange={(e) => set(Number(e.target.value), minute)}
        className="teg-time-slider w-full"
        style={{ accentColor: accent, color: accent }}
      />
      <div className="mt-1 flex justify-between text-[10px] text-gray-400">
        <span>{START_HOUR % 12 || 12}am</span>
        <span>12pm</span>
        <span>{END_HOUR % 12 || 12}pm</span>
      </div>
      {/* Minute pills — 15-minute increments */}
      <div className="mt-3 grid grid-cols-4 gap-2">
        {[0, 15, 30, 45].map((mm) => {
          const selected = mm === minute;
          return (
            <button
              key={mm}
              onClick={() => set(hour, mm)}
              className={`rounded-xl py-2.5 text-sm font-medium transition ${
                selected
                  ? "text-white"
                  : "border border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
              style={selected ? { backgroundColor: accent } : undefined}
            >
              :{String(mm).padStart(2, "0")}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Inline month calendar for scheduling — expands under the date field, picks a
// day (past days disabled), then collapses. Monday-first grid.
function InlineCalendar({
  value,
  accent,
  onPick,
}: {
  value: Date | null;
  accent: string;
  onPick: (d: Date) => void;
}) {
  const [month, setMonth] = useState(() => {
    const d = value ?? new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const year = month.getFullYear();
  const mon = month.getMonth();
  const firstWeekday = (new Date(year, mon, 1).getDay() + 6) % 7; // Mon = 0
  const daysInMonth = new Date(year, mon + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const canPrev =
    new Date(year, mon, 1) > new Date(today.getFullYear(), today.getMonth(), 1);

  return (
    <div className="rounded-xl border border-gray-200 p-3">
      <div className="flex items-center justify-between px-1 pb-2">
        <button
          disabled={!canPrev}
          onClick={() => setMonth(new Date(year, mon - 1, 1))}
          className="rounded-lg px-2 py-1 text-gray-400 hover:bg-gray-100 disabled:opacity-30"
          aria-label="Previous month"
        >
          ‹
        </button>
        <span className="text-sm font-semibold">
          {month.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
        </span>
        <button
          onClick={() => setMonth(new Date(year, mon + 1, 1))}
          className="rounded-lg px-2 py-1 text-gray-400 hover:bg-gray-100"
          aria-label="Next month"
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] font-medium text-gray-400">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <div key={i} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (day === null) return <div key={i} />;
          const date = new Date(year, mon, day);
          const past = date < today;
          const selected =
            value &&
            value.getFullYear() === year &&
            value.getMonth() === mon &&
            value.getDate() === day;
          return (
            <button
              key={i}
              disabled={past}
              onClick={() => onPick(date)}
              className={`aspect-square rounded-lg text-sm transition ${
                selected
                  ? "font-semibold text-white"
                  : past
                    ? "text-gray-300"
                    : "text-gray-700 hover:bg-gray-100"
              }`}
              style={selected ? { backgroundColor: accent } : undefined}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Sweeping expand/collapse — grid-rows 0fr→1fr animates auto height.
function Expand({ open, children }: { open: boolean; children: ReactNode }) {
  // The 0fr→1fr grid trick animates height smoothly; a matching opacity fade
  // on the same easing keeps it clean with no jagged edges. (No blur — it
  // flashed on close; an extra transformed inner wrapper breaks the fr height
  // measurement, so the content sits directly inside the clipped row.)
  return (
    <div
      className={`grid transition-all duration-[460ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
        open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
      }`}
    >
      <div className="overflow-hidden">{children}</div>
    </div>
  );
}

function BigBtn({
  children,
  onClick,
  primary,
  accent,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  primary?: boolean;
  accent?: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full rounded-2xl py-3.5 text-sm font-semibold transition disabled:opacity-60 ${
        primary
          ? "text-white hover:opacity-90"
          : "border border-gray-200 text-gray-800 hover:bg-gray-50"
      }`}
      style={primary && accent ? { backgroundColor: accent } : undefined}
    >
      {children}
    </button>
  );
}
