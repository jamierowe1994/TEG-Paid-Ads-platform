"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  getUser,
  fetchLeads,
  moveLeadStage,
  pushLeadToCrm,
  addLeadNote,
  bookLeadAppointment,
  cancelLeadAppointment,
} from "@/lib/session";
import { brandById, type Brand } from "@/lib/brands";
import { packageById } from "@/lib/packages";
import SourceIcon from "@/components/SourceIcon";
import type { Lead, LeadStage } from "@/lib/types";

// Leads funnel — built to be usable by anyone. Compact clickable tiles,
// newest first; click a tile to open a full modal with everything (contact,
// timeline, and the one obvious next action). Progressive: each stage only
// surfaces the next relevant action, so nobody has to think.
//
// New → up to 3 contact attempts → (no answer) marketing funnel → book the
// appointment → push to the brand's CRM (Atlas is live; others pending).

function stageLabel(stage: LeadStage, brand: Brand): string {
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

function whatFor(lead: Lead): string {
  return lead.interestedIn?.trim() || lead.note?.trim() || "Enquiry";
}

function shortDate(iso: string): string {
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

// Human-friendly duration for speed-to-lead (e.g. "42m", "3h 10m", "1d 4h").
function fmtDuration(ms: number): string {
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h < 24) return m ? `${h}h ${m}m` : `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

// Average time from a lead landing to its first contact attempt (any action
// past "new"). Leads not yet actioned are excluded. Lower is better.
function avgSpeedToLead(leads: Lead[]): number | null {
  const samples = leads
    .map((l) => {
      const first = l.history.find((h) => h.stage !== "new");
      return first
        ? new Date(first.at).getTime() - new Date(l.receivedAt).getTime()
        : null;
    })
    .filter((v): v is number => v !== null && v >= 0);
  if (samples.length === 0) return null;
  return samples.reduce((a, b) => a + b, 0) / samples.length;
}

type SortOrder = "newest" | "oldest" | "uncontacted";

const SORTS: { id: SortOrder; label: string }[] = [
  { id: "newest", label: "Newest first" },
  { id: "oldest", label: "Oldest first" },
  { id: "uncontacted", label: "Not contacted first" },
];

export default function LeadsPage() {
  const [brand, setBrand] = useState<Brand | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [adSpend, setAdSpend] = useState(0);
  const [monthlyCost, setMonthlyCost] = useState(0);
  const [newOnly, setNewOnly] = useState(false);
  const [sort, setSort] = useState<SortOrder>("newest");
  const [filterOpen, setFilterOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [pushing, setPushing] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    const u = getUser();
    if (!u) return;
    setBrand(brandById(u.brandId) ?? null);
    const pkg = packageById(u.packageId);
    setAdSpend(pkg?.adSpend ?? 0);
    setMonthlyCost(pkg?.price ?? 0);
    fetchLeads().then(setLeads);
  }, []);

  const visible = useMemo(() => {
    const base = newOnly ? leads.filter((l) => l.stage === "new") : leads;
    const byNewest = (a: Lead, b: Lead) =>
      new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime();
    return [...base].sort((a, b) => {
      if (sort === "oldest") return -byNewest(a, b);
      if (sort === "uncontacted") {
        const rank = (l: Lead) => (l.stage === "new" ? 0 : 1);
        return rank(a) - rank(b) || byNewest(a, b);
      }
      return byNewest(a, b);
    });
  }, [leads, newOnly, sort]);

  function showToast(msg: string, ms = 3500) {
    setToast(msg);
    setTimeout(() => setToast(""), ms);
  }

  function update(leadId: string, stage: LeadStage) {
    const previous = leads;
    setLeads(
      leads.map((l) =>
        l.id === leadId
          ? {
              ...l,
              stage,
              history: [...l.history, { stage, at: new Date().toISOString() }],
            }
          : l
      )
    );
    moveLeadStage(leadId, stage).then((saved) => {
      if (!saved) {
        setLeads(previous);
        showToast("Couldn't save that — please try again", 3000);
      }
    });
  }

  async function pushToCrm(lead: Lead) {
    if (!brand || pushing) return;

    // The Recruitment Experts push live into Atlas. Other brands' CRMs (REP
    // etc.) aren't wired yet — keep the "pending" stub for those.
    if (brand.crmName !== "Atlas") {
      update(lead.id, "pushed");
      showToast(`${lead.name} sent to ${brand.crmName} ✓ (integration pending)`);
      return;
    }

    setPushing(lead.id);
    const res = await pushLeadToCrm(lead.id);
    setPushing(null);

    if (!res.ok) {
      showToast(res.error ?? "Couldn't push to Atlas — please try again");
      return;
    }

    setLeads((prev) =>
      prev.map((l) =>
        l.id === lead.id
          ? {
              ...l,
              stage: "pushed",
              history: [
                ...l.history,
                { stage: "pushed" as LeadStage, at: new Date().toISOString() },
              ],
            }
          : l
      )
    );
    const extra = res.alreadyExisted
      ? " (already in Atlas — note added)"
      : res.noteAttached
        ? " with notes"
        : "";
    showToast(`${lead.name} pushed to Atlas ✓${extra}`);
  }

  function applyLead(updated: Lead | null, okMsg?: string, failMsg?: string) {
    if (updated) {
      setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
      if (okMsg) showToast(okMsg);
    } else if (failMsg) {
      showToast(failMsg);
    }
  }

  async function addNote(leadId: string, text: string) {
    applyLead(await addLeadNote(leadId, text), undefined, "Couldn't save note");
  }
  async function book(leadId: string, at: string) {
    applyLead(
      await bookLeadAppointment(leadId, at),
      "Appointment booked ✓",
      "Couldn't book — please try again"
    );
  }
  async function cancelBooking(leadId: string) {
    applyLead(
      await cancelLeadAppointment(leadId),
      "Booking cancelled",
      "Couldn't cancel — please try again"
    );
  }

  if (!brand) return null;

  const open = openId ? leads.find((l) => l.id === openId) ?? null : null;

  // ── Headline stats (stripped to the four that matter) ────────────────
  const total = leads.length;
  const appointments = leads.filter(
    (l) => l.stage === "converted" || l.stage === "pushed"
  ).length;
  const conversionRate =
    total > 0 ? Math.round((appointments / total) * 100) : 0;
  const speed = avgSpeedToLead(leads);

  return (
    <div className="w-full">
      <h1 className="text-3xl font-semibold tracking-tight">Leads</h1>
      <p className="mt-2 text-gray-500">
        Tap a lead to see everything and mark your next step.
      </p>

      {/* Headline stats */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Total leads" value={String(total)} />
        <Stat
          label="Cost this month"
          value={`£${monthlyCost}`}
          note={`£${adSpend} of that is ad spend`}
        />
        <Stat
          label="Appointments booked"
          value={String(appointments)}
          accent={brand.accent}
        />
        <Stat label="Conversion rate" value={`${conversionRate}%`} />
        <Stat
          label="Speed to lead"
          value={speed === null ? "—" : fmtDuration(speed)}
          note="Avg time to first contact"
        />
      </div>

      {/* Controls: New-only pill + filter popout */}
      <div className="mt-8 flex items-center justify-between gap-3">
        <button
          onClick={() => setNewOnly((v) => !v)}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
            newOnly
              ? "text-white"
              : "border border-gray-200 text-gray-600 hover:bg-gray-50"
          }`}
          style={newOnly ? { backgroundColor: brand.accent } : undefined}
        >
          New only
        </button>

        <div className="relative">
          <button
            onClick={() => setFilterOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.75 6h16.5M6.75 12h10.5m-7.5 6h4.5"
              />
            </svg>
            Sort
          </button>
          {filterOpen && (
            <>
              <button
                className="fixed inset-0 z-10 cursor-default"
                onClick={() => setFilterOpen(false)}
                aria-label="Close"
              />
              <div className="absolute right-0 z-20 mt-2 w-52 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
                {SORTS.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      setSort(s.id);
                      setFilterOpen(false);
                    }}
                    className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-gray-50 ${
                      sort === s.id ? "font-semibold text-gray-900" : "text-gray-600"
                    }`}
                  >
                    {s.label}
                    {sort === s.id && <span style={{ color: brand.accent }}>✓</span>}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Lead tiles */}
      <div className="mt-4 space-y-3">
        {visible.map((lead) => {
          return (
            <button
              key={lead.id}
              onClick={() => setOpenId(lead.id)}
              className="flex w-full items-center gap-4 rounded-2xl border border-gray-200 shadow-sm bg-white p-4 text-left transition hover:border-gray-300 hover:shadow-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <SourceIcon
                    source={lead.source}
                    size={16}
                    className="shrink-0"
                  />
                  <h3 className="truncate font-semibold">{lead.name}</h3>
                  {lead.adName && (
                    <span className="hidden truncate text-xs text-gray-400 sm:inline">
                      · {lead.adName}
                    </span>
                  )}
                </div>
                <p className="mt-1 truncate text-sm text-gray-500">
                  {whatFor(lead)}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span
                  className="rounded-full px-3 py-1 text-xs font-medium"
                  style={{ backgroundColor: brand.accentSoft, color: brand.accent }}
                >
                  {stageLabel(lead.stage, brand)}
                </span>
                <span className="text-[11px] text-gray-400">
                  {shortDate(lead.receivedAt)}
                </span>
              </div>
            </button>
          );
        })}
        {visible.length === 0 && (
          <div className="rounded-2xl border border-dashed border-gray-200 py-16 text-center text-sm text-gray-400">
            {newOnly
              ? "No new leads right now."
              : "No leads yet — they'll drop in here automatically once your ads are live."}
          </div>
        )}
      </div>

      {/* Lead detail modal */}
      {open && (
        <LeadModal
          lead={open}
          brand={brand}
          pushing={pushing === open.id}
          onClose={() => setOpenId(null)}
          onStage={(s) => update(open.id, s)}
          onPush={() => pushToCrm(open)}
          onAddNote={(text) => addNote(open.id, text)}
          onBook={(at) => book(open.id, at)}
          onCancelBooking={() => cancelBooking(open.id)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-xl bg-gray-900 px-5 py-3 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
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

// ── Lead detail modal ───────────────────────────────────────────────────
function LeadModal({
  lead,
  brand,
  pushing,
  onClose,
  onStage,
  onPush,
  onAddNote,
  onBook,
  onCancelBooking,
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
}) {
  const [showTimeline, setShowTimeline] = useState(false);
  const [panel, setPanel] = useState<null | "call" | "email">(null);
  const [callTab, setCallTab] = useState<"notes" | "schedule">("notes");
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [bookDate, setBookDate] = useState("");
  const [booking, setBooking] = useState(false);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [emailToast, setEmailToast] = useState("");

  const firstName = lead.name.split(" ")[0] || "there";
  const events = [
    { label: "Lead received", at: lead.receivedAt },
    ...lead.history.map((h) => ({ label: stageLabel(h.stage, brand), at: h.at })),
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

  async function saveNote() {
    if (!noteText.trim() || savingNote) return;
    setSavingNote(true);
    await onAddNote(noteText.trim());
    setSavingNote(false);
    setNoteText("");
  }

  async function confirmBooking() {
    if (!bookDate || booking) return;
    setBooking(true);
    await onBook(bookDate);
    setBooking(false);
    setBookDate("");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/50 p-0 sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white p-6 sm:rounded-3xl sm:p-7"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <SourceIcon source={lead.source} size={20} />
              <h2 className="text-xl font-semibold">{lead.name}</h2>
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
          <div className="mt-3 rounded-2xl border border-gray-200 p-4">
            <a
              href={`tel:${lead.phone}`}
              className="inline-flex items-center gap-1.5 text-sm font-medium"
              style={{ color: brand.accent }}
            >
              📞 {lead.phone}
            </a>
            <div className="mt-3 flex gap-1 rounded-xl bg-gray-100 p-1 text-sm">
              {(["notes", "schedule"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setCallTab(t)}
                  className={`flex-1 rounded-lg py-1.5 font-medium capitalize transition ${
                    callTab === t ? "bg-white shadow-sm" : "text-gray-500"
                  }`}
                >
                  {t === "notes" ? "Add notes" : "Schedule a call"}
                </button>
              ))}
            </div>

            {callTab === "notes" ? (
              <div className="mt-3">
                {notes.length > 0 && (
                  <ul className="mb-3 space-y-2">
                    {[...notes].reverse().map((n, i) => (
                      <li key={i} className="rounded-xl bg-gray-50 p-3 text-sm text-gray-700">
                        {n.text}
                        <span className="mt-1 block text-[11px] text-gray-400">
                          {fullDate(n.at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  rows={3}
                  placeholder="Log a call, jot a reminder…"
                  className="w-full rounded-xl border border-gray-200 p-3 text-sm outline-none focus:border-gray-900"
                />
                <BigBtn
                  primary
                  accent={brand.accent}
                  disabled={!noteText.trim() || savingNote}
                  onClick={saveNote}
                >
                  {savingNote ? "Saving…" : "Save note"}
                </BigBtn>
              </div>
            ) : (
              <div className="mt-3">
                {booked && (
                  <p className="mb-3 rounded-xl bg-green-50 p-3 text-sm font-medium text-green-700">
                    📅 Booked for {apptLabel(lead.appointmentAt!)}
                  </p>
                )}
                <input
                  type="datetime-local"
                  value={bookDate}
                  onChange={(e) => setBookDate(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 p-3 text-sm outline-none focus:border-gray-900"
                />
                <BigBtn
                  primary
                  accent={brand.accent}
                  disabled={!bookDate || booking}
                  onClick={confirmBooking}
                >
                  {booking ? "Saving…" : booked ? "Rearrange" : "Book it in"}
                </BigBtn>
                {booked && (
                  <button
                    onClick={onCancelBooking}
                    className="mt-2 w-full rounded-2xl py-2.5 text-sm font-medium text-gray-400 hover:bg-gray-50 hover:text-gray-600"
                  >
                    Cancel booking
                  </button>
                )}
              </div>
            )}
          </div>
        </Expand>

        {/* Email panel — compose or pick a template */}
        <Expand open={panel === "email"}>
          <div className="mt-3 rounded-2xl border border-gray-200 p-4">
            <p className="text-sm font-medium text-gray-700">
              ✉ <span className="text-gray-500">{lead.email}</span>
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {EMAIL_TEMPLATES.map((t) => (
                <button
                  key={t.name}
                  onClick={() => {
                    setEmailSubject(t.subject);
                    setEmailBody(t.body);
                  }}
                  className="rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
                >
                  {t.name}
                </button>
              ))}
            </div>
            <input
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
              placeholder="Subject"
              className="mt-3 w-full rounded-xl border border-gray-200 p-3 text-sm outline-none focus:border-gray-900"
            />
            <textarea
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
              rows={6}
              placeholder="Write your email, or pick a template above…"
              className="mt-2 w-full rounded-xl border border-gray-200 p-3 text-sm outline-none focus:border-gray-900"
            />
            <BigBtn
              primary
              accent={brand.accent}
              disabled={!emailSubject.trim() || !emailBody.trim()}
              onClick={() => {
                setEmailToast(
                  "Draft ready ✓ — sending from the portal switches on with Azure email."
                );
                setTimeout(() => setEmailToast(""), 4000);
              }}
            >
              Send email
            </BigBtn>
            {emailToast && (
              <p className="mt-2 text-center text-xs text-gray-500">{emailToast}</p>
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
              <p className="rounded-2xl bg-green-50 py-3 text-center text-sm font-medium text-green-700">
                ✓ In {brand.crmName}
                {booked ? ` · ${apptLabel(lead.appointmentAt!)}` : ""}
              </p>
            )}

            {/* Mark lost / reopen */}
            {canWork && (
              <button
                onClick={() => onStage("lost")}
                className="w-full rounded-2xl py-2.5 text-sm font-medium text-gray-400 hover:bg-gray-50 hover:text-gray-600"
              >
                Mark as lost
              </button>
            )}
            {lead.stage === "lost" && (
              <BigBtn onClick={() => onStage("new")}>Reopen lead</BigBtn>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Sweeping expand/collapse — grid-rows 0fr→1fr animates auto height.
function Expand({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div
      className={`grid transition-all duration-300 ease-out ${
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

function Stat({
  label,
  value,
  note,
  accent,
}: {
  label: string;
  value: string;
  note?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 shadow-sm p-5">
      <p className="text-sm text-gray-500">{label}</p>
      <p
        className="mt-2 text-3xl font-semibold tracking-tight"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </p>
      {note && <p className="mt-1 text-xs text-gray-400">{note}</p>}
    </div>
  );
}
