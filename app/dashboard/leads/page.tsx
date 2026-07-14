"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getUser,
  fetchLeads,
  moveLeadStage,
  pushLeadToCrm,
  resetRexLead,
  addLeadNote,
  bookLeadAppointment,
  cancelLeadAppointment,
  archiveLeads,
  snoozeLeadUntil,
  setLeadFollowUp,
  crmCheckAllLeads,
  sendLeadEmail,
} from "@/lib/session";
import { brandById, type Brand } from "@/lib/brands";
import { packageById } from "@/lib/packages";
import SourceIcon from "@/components/SourceIcon";
import { LeadModal, stageLabel, shortDate } from "./lead-modal";
import type { Lead, LeadStage } from "@/lib/types";

// Leads funnel — built to be usable by anyone. Compact clickable tiles,
// newest first; click a tile to open a full modal with everything (contact,
// timeline, and the one obvious next action). Progressive: each stage only
// surfaces the next relevant action, so nobody has to think.
//
// New → up to 3 contact attempts → (no answer) marketing funnel → book the
// appointment → push to the brand's CRM (Atlas is live; others pending).

// Tiles per snake row (matches the sm:grid-cols-4 layout below).
const ROW_SIZE = 4;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

type TileSize = "lg" | "md" | "sm";

// True when the CRM already has this person — either a duplicate check found
// them, or a push revealed/created them there.
function onCrm(lead: Lead): boolean {
  return !!(lead.crmMatch?.found || lead.rexContactId);
}

// A contact value (email / phone) with a one-tap copy button. Stops the click
// bubbling so copying never opens the lead modal.
function CopyField({
  kind,
  value,
}: {
  kind: "email" | "phone";
  value: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-1.5">
      <svg
        viewBox="0 0 24 24"
        className="h-3.5 w-3.5 shrink-0 text-gray-400"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {kind === "email" ? (
          <>
            <rect x="2.5" y="4.5" width="19" height="15" rx="2" />
            <path d="M3 6l9 7 9-7" />
          </>
        ) : (
          <path d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
        )}
      </svg>
      <span className="min-w-0 flex-1 truncate text-[11px] text-gray-600">
        {value}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          navigator.clipboard?.writeText(value).then(
            () => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            },
            () => {}
          );
        }}
        aria-label={`Copy ${kind}`}
        className="shrink-0 rounded-md p-1 text-gray-300 transition hover:bg-gray-100 hover:text-gray-700"
      >
        {copied ? (
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-green-600" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="11" height="11" rx="2" />
            <path d="M5 15V5a2 2 0 012-2h10" />
          </svg>
        )}
      </button>
    </div>
  );
}

// A "mini profile" tile — uniform faint-outlined card: where the lead came
// from, their name, and their email + mobile with quick-copy. Sized down for
// older rows so the snake still reads as a fade. In the archive, tiles grow a
// selection ring (multi-select unarchive).
function LeadTile({
  lead,
  brand,
  size,
  onClick,
  selectable,
  selected,
  onToggleSelect,
}: {
  lead: Lead;
  brand: Brand;
  size: TileSize;
  onClick: () => void;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const pad = size === "lg" ? "p-4" : size === "md" ? "p-3.5" : "p-3";
  const nameSize = size === "lg" ? "text-sm" : "text-[13px]";
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter") onClick();
      }}
      className={`relative flex w-full cursor-pointer flex-col rounded-2xl bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${pad} ${
        selected
          ? "border border-gray-900 ring-2 ring-gray-900"
          : "border border-black/10 hover:border-black/20"
      }`}
    >
      {/* Where it came from + who, with the date (and archive checkbox) */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <SourceIcon source={lead.source} size={14} />
          <p className={`truncate font-semibold text-gray-900 ${nameSize}`}>
            {lead.name}
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 text-[10px] text-gray-400">
          {shortDate(lead.receivedAt)}
          {selectable && (
            <span
              role="checkbox"
              aria-checked={selected}
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelect?.();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onToggleSelect?.();
                }
              }}
              className={`flex h-5 w-5 items-center justify-center rounded-full border text-[11px] transition ${
                selected
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-300 text-transparent hover:border-gray-500"
              }`}
            >
              ✓
            </span>
          )}
        </span>
      </div>

      {/* Contact — quick copy for email + mobile */}
      <div className="mt-3 space-y-1.5">
        {lead.email ? (
          <CopyField kind="email" value={lead.email} />
        ) : null}
        {lead.phone ? <CopyField kind="phone" value={lead.phone} /> : null}
        {!lead.email && !lead.phone && (
          <p className="text-[11px] text-gray-300">No contact details</p>
        )}
      </div>

      {/* Footer — neutral stage label + the "on CRM" flag */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1">
        <span className="inline-block w-fit rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
          {lead.resurfaceAt
            ? `Back ${shortDate(lead.resurfaceAt)}`
            : stageLabel(lead.stage, brand)}
        </span>
        {onCrm(lead) && (
          <span className="inline-block w-fit rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
            On {brand.crmName}
          </span>
        )}
      </div>
    </div>
  );
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

// Time-range filter — mainly so a big historic import (backfilled Meta leads
// keep their original dates) doesn't drown out what's actually current.
type TimeRange = "all" | "7d" | "30d";

const RANGES: { id: TimeRange; label: string; days?: number }[] = [
  { id: "7d", label: "This week", days: 7 },
  { id: "30d", label: "Last 30 days", days: 30 },
  { id: "all", label: "All time" },
];

export default function LeadsPage() {
  const [brand, setBrand] = useState<Brand | null>(null);
  const [emailConnected, setEmailConnected] = useState(false);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [adSpend, setAdSpend] = useState(0);
  const [monthlyCost, setMonthlyCost] = useState(0);
  const [newOnly, setNewOnly] = useState(false);
  // Default to this week — the freshest leads are the ones that matter most.
  const [range, setRange] = useState<TimeRange>("7d");
  const [sort, setSort] = useState<SortOrder>("newest");
  const [filterOpen, setFilterOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [pushing, setPushing] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [view, setView] = useState<"active" | "lost" | "archived">("active");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [checkingCrm, setCheckingCrm] = useState(false);
  const [archiving, setArchiving] = useState(false);

  useEffect(() => {
    const u = getUser();
    if (!u) return;
    setBrand(brandById(u.brandId) ?? null);
    setEmailConnected(!!u.msEmail);
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

  // A notification clicked while ALREADY on this page can't remount it —
  // the layout announces the lead instead.
  useEffect(() => {
    const onOpen = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (id) setOpenId(id);
    };
    window.addEventListener("teg:open-lead", onOpen);
    return () => window.removeEventListener("teg:open-lead", onOpen);
  }, []);

  const lostCount = useMemo(
    () => leads.filter((l) => l.stage === "lost" && !l.archivedAt).length,
    [leads]
  );
  const archivedCount = useMemo(
    () => leads.filter((l) => !!l.archivedAt).length,
    [leads]
  );
  // "Finished" = done (pushed) or lost — the ones safe to file away in bulk.
  const finished = useMemo(
    () =>
      leads.filter(
        (l) => !l.archivedAt && (l.stage === "pushed" || l.stage === "lost")
      ),
    [leads]
  );

  const visible = useMemo(() => {
    let base =
      view === "archived"
        ? leads.filter((l) => !!l.archivedAt)
        : view === "lost"
          ? leads.filter((l) => l.stage === "lost" && !l.archivedAt)
          : newOnly
            ? leads.filter((l) => l.stage === "new" && !l.archivedAt)
            : leads.filter((l) => l.stage !== "lost" && !l.archivedAt);
    const days = RANGES.find((r) => r.id === range)?.days;
    if (days && view !== "archived") {
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      base = base.filter((l) => new Date(l.receivedAt).getTime() >= cutoff);
    }
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
  }, [leads, newOnly, range, sort, view]);

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

    setPushing(lead.id);
    const res = await pushLeadToCrm(lead.id);
    setPushing(null);

    if (!res.ok) {
      showToast(res.error ?? `Couldn't push to ${brand.crmName} — please try again`);
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
    // The push pre-checks by email/phone so a person is never duplicated —
    // spell out which of the two paths happened.
    if (res.contactAlreadyExisted) {
      showToast(
        `${lead.name} is already on ${brand.crmName} — new enquiry added to their existing record ✓`,
        5000
      );
      return;
    }
    const extra = res.alreadyExisted
      ? ` (already in ${brand.crmName} — note added)`
      : res.noteAttached
        ? " with notes"
        : "";
    showToast(`${lead.name} pushed to ${brand.crmName} ✓${extra}`);
  }

  // "They've been deleted in REX" — verify with Rex; if genuinely gone, the
  // file resets to converted (timeline records it) and the push returns.
  async function rexReset(lead: Lead) {
    if (!brand) return;
    const res = await resetRexLead(lead.id);
    if (res.ok && res.lead) {
      setLeads((prev) => prev.map((l) => (l.id === lead.id ? res.lead! : l)));
      showToast(
        `${lead.name} was removed from ${brand.crmName} — file reset, ready to push again ✓`,
        5000
      );
    } else if (res.stillInRex) {
      showToast(`${lead.name} is still in ${brand.crmName} — nothing to reset.`);
    } else {
      showToast(res.error ?? "Couldn't check REX — please try again");
    }
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

  // Archive / unarchive a batch (the API returns the refreshed list).
  // Returns whether it worked so callers only close modals on success.
  async function setArchived(
    ids: string[],
    archived: boolean,
    msg: string
  ): Promise<boolean> {
    if (ids.length === 0 || archiving) return false;
    setArchiving(true);
    const updated = await archiveLeads(ids, archived);
    setArchiving(false);
    if (updated) {
      setLeads(updated);
      setSelected(new Set());
      showToast(msg);
      return true;
    }
    showToast("Couldn't update — please try again");
    return false;
  }

  // "Save for a later date" — snoozes the lead; it comes back as new on the
  // chosen date with a WhatsApp ping.
  async function snooze(
    lead: Lead,
    until: string,
    reason: string
  ): Promise<boolean> {
    const res = await snoozeLeadUntil(lead.id, until, reason);
    if (res.ok && res.lead) {
      setLeads((prev) => prev.map((l) => (l.id === res.lead!.id ? res.lead! : l)));
      showToast(
        `${lead.name} saved for later — back as a new lead on ${shortDate(until)} ✓`,
        5000
      );
      return true;
    }
    showToast(res.error ?? "Couldn't save — please try again");
    return false;
  }

  // Sweep every unchecked lead against the brand's CRM.
  async function runCrmCheck() {
    if (checkingCrm || !brand) return;
    setCheckingCrm(true);
    const res = await crmCheckAllLeads();
    setCheckingCrm(false);
    if (!res.ok) {
      showToast(res.error ?? "Couldn't check — please try again");
      return;
    }
    if (res.leads) setLeads(res.leads);
    if (res.unavailable && !res.checked) {
      showToast(
        `Couldn't check ${brand.crmName} right now — duplicates are still caught when you push.`,
        5000
      );
    } else {
      const base = `Checked ${res.checked ?? 0} lead${(res.checked ?? 0) === 1 ? "" : "s"} — ${
        res.found ? `${res.found} already on ${brand.crmName}` : `none already on ${brand.crmName}`
      }`;
      showToast(
        res.unavailable
          ? `${base}. Some couldn't be checked — run it again later.`
          : `${base} ✓`,
        6000
      );
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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

      {/* Active / Lost / Archived tabs */}
      <div className="mt-8 flex items-center gap-1 border-b border-gray-100">
        {(["active", "lost", "archived"] as const).map((v) => (
          <button
            key={v}
            onClick={() => {
              setView(v);
              setSelected(new Set());
            }}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium capitalize transition ${
              view === v
                ? "border-gray-900 text-gray-900"
                : "border-transparent text-gray-400 hover:text-gray-600"
            }`}
          >
            {v === "active"
              ? "Active"
              : v === "lost"
                ? `Lost deals${lostCount ? ` (${lostCount})` : ""}`
                : `Archived${archivedCount ? ` (${archivedCount})` : ""}`}
          </button>
        ))}
      </div>

      {/* Controls: New-only pill + filter popout */}
      <div className="mt-4 flex items-center justify-between gap-3">
        {view === "active" ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setNewOnly((v) => !v)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                newOnly
                  ? "text-white"
                  : "border border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
              style={newOnly ? { backgroundColor: brand.accent } : undefined}
            >
              New only
            </button>
            {/* Darker separator so the New-only toggle reads apart from the
                date group */}
            <span className="mx-1 h-5 w-px bg-gray-400" aria-hidden />
            {/* Date filter — tucks a big historic import out of the way. Active
                pill is dark grey; the rest are grey outlines. */}
            {RANGES.map((r) => (
              <button
                key={r.id}
                onClick={() => setRange(r.id)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                  range === r.id
                    ? "bg-neutral-800 text-white"
                    : "border border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                {r.label}
              </button>
            ))}
            <span className="mx-1 h-5 w-px bg-gray-400" aria-hidden />
            {/* Duplicate check — clear (no fill) so it doesn't shout */}
            <button
              onClick={runCrmCheck}
              disabled={checkingCrm}
              className="rounded-full border border-gray-300 px-4 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-60"
            >
              {checkingCrm ? `Checking ${brand.crmName}…` : `Check ${brand.crmName}`}
            </button>
            {/* File away everything that's finished (done or lost) */}
            {finished.length > 0 && (
              <button
                onClick={() =>
                  setArchived(
                    finished.map((l) => l.id),
                    true,
                    `Archived ${finished.length} finished lead${finished.length === 1 ? "" : "s"} ✓`
                  )
                }
                disabled={archiving}
                className="rounded-full border border-gray-200 px-4 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-60"
              >
                {archiving ? "Archiving…" : `Archive finished (${finished.length})`}
              </button>
            )}
          </div>
        ) : view === "lost" ? (
          <span className="text-sm text-gray-400">
            Deals you marked lost. Reopen any from its card.
          </span>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-gray-400">
              Filed away, never deleted — tick tiles to bring them back.
            </span>
            {visible.length > 0 && (
              <button
                onClick={() =>
                  setSelected(
                    selected.size === visible.length
                      ? new Set()
                      : new Set(visible.map((l) => l.id))
                  )
                }
                className="rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                {selected.size === visible.length ? "Deselect all" : "Select all"}
              </button>
            )}
            {selected.size > 0 && (
              <button
                onClick={() =>
                  setArchived(
                    [...selected],
                    false,
                    `${selected.size} lead${selected.size === 1 ? "" : "s"} brought back ✓`
                  )
                }
                disabled={archiving}
                className="rounded-full bg-gray-900 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-gray-700 disabled:opacity-60"
              >
                {archiving ? "Restoring…" : `Unarchive ${selected.size} selected`}
              </button>
            )}
          </div>
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

      {/* Lead tiles — mini profile cards in a snake pattern: newest at the
          top-right, each row alternating direction, tapering smaller for
          older rows so recency reads at a glance. */}
      <div className="mt-4 flex flex-col gap-3">
        {chunk(visible, ROW_SIZE).map((row, ri) => {
          const size: TileSize = ri < 2 ? "lg" : ri < 5 ? "md" : "sm";
          return (
            <div
              key={ri}
              dir={ri % 2 === 0 ? "rtl" : "ltr"}
              className="grid grid-cols-2 gap-3 sm:grid-cols-4"
            >
              {row.map((lead) => (
                <div dir="ltr" key={lead.id}>
                  <LeadTile
                    lead={lead}
                    brand={brand}
                    size={size}
                    onClick={() => setOpenId(lead.id)}
                    selectable={view === "archived"}
                    selected={selected.has(lead.id)}
                    onToggleSelect={() => toggleSelect(lead.id)}
                  />
                </div>
              ))}
            </div>
          );
        })}
        {visible.length === 0 && (
          <div className="rounded-2xl border border-dashed border-gray-200 py-16 text-center text-sm text-gray-400">
            {view === "lost"
              ? "No lost deals — keep it that way. 💪"
              : view === "archived"
                ? "Nothing archived yet — finished leads can be filed away here."
                : newOnly
                  ? "No new leads right now."
                  : range !== "all" && leads.length > 0
                    ? "No leads in this time range — try All time."
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
          onRexReset={() => rexReset(open)}
          onArchive={async (archived) => {
            const ok = await setArchived(
              [open.id],
              archived,
              archived ? `${open.name} archived ✓` : `${open.name} brought back ✓`
            );
            if (ok) setOpenId(null);
          }}
          onSnooze={async (until, reason) => {
            const ok = await snooze(open, until, reason);
            if (ok) setOpenId(null);
          }}
          onFollowUp={async (at) => {
            const res = await setLeadFollowUp(open.id, at);
            if (res.ok) {
              const fresh = await fetchLeads();
              setLeads(fresh);
              if (at) setOpenId(null); // it's resting now — close the file
            }
          }}
          emailConnected={emailConnected}
          onSendEmail={async (subject, body) => {
            const res = await sendLeadEmail(open.id, subject, body);
            if (res.ok && res.lead) {
              setLeads((prev) =>
                prev.map((l) => (l.id === res.lead!.id ? res.lead! : l))
              );
            }
            return { ok: res.ok, error: res.error };
          }}
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
    // Same drop + all-around inner shadow as the Overview tiles, so the
    // stat boxes sit forward and read as one system.
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.12),inset_0_1px_1px_rgba(255,255,255,0.7),inset_0_0_30px_rgba(0,0,0,0.08)]">
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
