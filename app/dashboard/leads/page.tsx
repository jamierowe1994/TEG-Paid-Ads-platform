"use client";

import { useEffect, useMemo, useState } from "react";
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
import { LeadModal, stageLabel, whatFor, shortDate } from "./lead-modal";
import type { Lead, LeadStage } from "@/lib/types";

// Leads funnel — built to be usable by anyone. Compact clickable tiles,
// newest first; click a tile to open a full modal with everything (contact,
// timeline, and the one obvious next action). Progressive: each stage only
// surfaces the next relevant action, so nobody has to think.
//
// New → up to 3 contact attempts → (no answer) marketing funnel → book the
// appointment → push to the brand's CRM (Atlas is live; others pending).


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
  const [view, setView] = useState<"active" | "lost">("active");

  useEffect(() => {
    const u = getUser();
    if (!u) return;
    setBrand(brandById(u.brandId) ?? null);
    const pkg = packageById(u.packageId);
    setAdSpend(pkg?.adSpend ?? 0);
    setMonthlyCost(pkg?.price ?? 0);
    fetchLeads().then((ls) => {
      setLeads(ls);
      // Deep link from the global search bar: /dashboard/leads?lead=<id>
      const id = new URLSearchParams(window.location.search).get("lead");
      if (id && ls.some((l) => l.id === id)) setOpenId(id);
    });
  }, []);

  const lostCount = useMemo(
    () => leads.filter((l) => l.stage === "lost").length,
    [leads]
  );

  const visible = useMemo(() => {
    const base =
      view === "lost"
        ? leads.filter((l) => l.stage === "lost")
        : newOnly
          ? leads.filter((l) => l.stage === "new")
          : leads.filter((l) => l.stage !== "lost");
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
  }, [leads, newOnly, sort, view]);

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

      {/* Active / Lost deals tabs */}
      <div className="mt-8 flex items-center gap-1 border-b border-gray-100">
        {(["active", "lost"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium capitalize transition ${
              view === v
                ? "border-gray-900 text-gray-900"
                : "border-transparent text-gray-400 hover:text-gray-600"
            }`}
          >
            {v === "active" ? "Active" : `Lost deals${lostCount ? ` (${lostCount})` : ""}`}
          </button>
        ))}
      </div>

      {/* Controls: New-only pill + filter popout */}
      <div className="mt-4 flex items-center justify-between gap-3">
        {view === "active" ? (
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
        ) : (
          <span className="text-sm text-gray-400">
            Deals you marked lost. Reopen any from its card.
          </span>
        )}

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
            {view === "lost"
              ? "No lost deals — keep it that way. 💪"
              : newOnly
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
