"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { Lead, LeadStage } from "@/lib/types";
import type { Brand } from "@/lib/brands";
import SourceIcon from "@/components/SourceIcon";
import { geocodeUk, extractPostcode } from "@/lib/geo-uk";
import { loadGoogleMaps } from "@/lib/google-maps";
import { lostReasonsFor, warmReasonsFor } from "@/lib/lost-reasons";

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
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function apptLabel(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const LOST_GIF = "/images/Sad%20Michael%20Scott%20GIF.gif";
const FUNNEL_GIF = "/images/Leonardo%20Dicaprio%20Kinda%20GIF.gif";

function GifCard({ src, emoji, tint }: { src: string; emoji: string; tint: string }) {
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

const attemptNext: Partial<Record<LeadStage, LeadStage>> = {
  new: "attempt1",
  attempt1: "attempt2",
  attempt2: "attempt3",
};

// ── Lead detail modal ─────────────────────────────────────────────────────
export function LeadModal({
  lead,
  brand,
  origin,
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
  onFollowUp,
  onUpdateFields,
  emailConnected,
  onSendEmail,
}: {
  lead: Lead;
  brand: Brand;
  origin?: DOMRect | null;
  pushing: boolean;
  onClose: () => void;
  onStage: (stage: LeadStage) => void;
  onPush: () => void;
  onAddNote: (text: string) => Promise<void>;
  onBook: (at: string) => Promise<void>;
  onCancelBooking: () => Promise<void>;
  onRexReset?: () => Promise<void>;
  onArchive?: (archived: boolean) => Promise<void>;
  onSnooze?: (until: string, reason: string, mode?: "nurture" | "lost") => Promise<void>;
  onFollowUp?: (at: string | null) => Promise<void>;
  // Inline edits to the lead's own fields (name / contact / address).
  onUpdateFields?: (fields: Partial<Lead>) => Promise<Lead | null | void>;
  emailConnected?: boolean;
  onSendEmail?: (
    subject: string,
    body: string
  ) => Promise<{ ok: boolean; error?: string }>;
}) {
  const accent = brand.accent;
  // Lost reasons are tailored per brand; the "warm" subset offers Keep Warm.
  const lostReasons = lostReasonsFor(brand.id);
  const warmReasons = warmReasonsFor(brand.id);
  const firstName = lead.name.split(" ")[0] || "there";
  const canWork = !["pushed", "lost"].includes(lead.stage);
  const booked = !!lead.appointmentAt;
  const notes = lead.notes ?? [];

  // Contact tool accordion: only one open at a time.
  const [panel, setPanel] = useState<null | "call" | "email" | "sched">(null);
  // Progressive prompts.
  const [followAsk, setFollowAsk] = useState(false);
  const [savingFollow, setSavingFollow] = useState(false);
  const [showInterested, setShowInterested] = useState(false);
  // Mobile only: the extra context (contact facts, interested-in, activity) is
  // hidden by default to keep the sheet to ~one screen, revealed on demand.
  const [mobileDetails, setMobileDetails] = useState(false);
  const [busy, setBusy] = useState(false);

  // Timeline.
  const events = [
    { label: "Lead received", at: lead.receivedAt },
    ...lead.history.map((h) => ({
      label: h.label ?? stageLabel(h.stage, brand),
      at: h.at,
    })),
  ];
  const [showAllEvents, setShowAllEvents] = useState(false);
  const [openEvent, setOpenEvent] = useState<number | null>(0);

  // Note bar.
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  // Email composer.
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [emailToast, setEmailToast] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailLogAsk, setEmailLogAsk] = useState(false);

  // Schedule.
  const apptDate = lead.appointmentAt ? new Date(lead.appointmentAt) : null;
  const [pickedDay, setPickedDay] = useState<Date | null>(
    apptDate ? new Date(apptDate.getFullYear(), apptDate.getMonth(), apptDate.getDate()) : null
  );
  const [pickedTime, setPickedTime] = useState(
    apptDate
      ? `${String(apptDate.getHours()).padStart(2, "0")}:${String(apptDate.getMinutes()).padStart(2, "0")}`
      : ""
  );
  const [booking, setBooking] = useState(false);
  const [resettingRex, setResettingRex] = useState(false);
  // The Schedule / Add-note / Add-location actions each open their own bottom
  // sheet. While any is open, tuck the bottom nav away so it can't sit over it.
  const [schedSheet, setSchedSheet] = useState(false);
  const [noteSheet, setNoteSheet] = useState(false);
  const [locSheet, setLocSheet] = useState(false);

  // Mark-as-lost flow.
  const [lostStep, setLostStep] = useState<null | "ask" | "reason" | "date" | "lostdate" | "funnel" | "funneldate" | "done">(null);

  // Any full-screen overlay (a sheet or the lost/nurture flow) tucks the bottom
  // nav out of the way so it can't sit over the content.
  const anyOverlay = schedSheet || noteSheet || locSheet || !!lostStep;
  useEffect(() => {
    window.dispatchEvent(new Event(anyOverlay ? "teg:nav-hide" : "teg:nav-show"));
  }, [anyOverlay]);
  const [savingLost, setSavingLost] = useState(false);
  const [lostReason, setLostReason] = useState("");
  const [nurtureReason, setNurtureReason] = useState("");
  const [snoozeDay, setSnoozeDay] = useState<Date | null>(null);
  const [savingSnooze, setSavingSnooze] = useState(false);

  // Lock the page behind the sheet while it's open, so on mobile you can only
  // scroll/swipe the sheet itself — the background can't drift and "freak out".
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // A tel/WhatsApp-ready number: strip spaces/punctuation; assume UK if it
  // starts 0 (drop the 0, prefix 44). WhatsApp deep-links need digits only.
  const waNumber = (() => {
    const raw = (lead.phone ?? "").replace(/[^\d+]/g, "");
    if (!raw) return "";
    if (raw.startsWith("+")) return raw.slice(1);
    if (raw.startsWith("0")) return "44" + raw.slice(1);
    return raw;
  })();

  // On mobile the dashboard's own bottom nav persists and morphs into this
  // lead's quick actions (Call / Email / WhatsApp / Schedule) while the sheet
  // is open — so we hand it this lead's contact details, and listen for its
  // Schedule tap (which just opens our in-sheet scheduler). See the shell nav
  // in app/dashboard/layout.tsx.
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("teg:lead-open", {
        detail: { phone: lead.phone, email: lead.email, wa: waNumber },
      }),
    );
    const sched = () => setSchedSheet(true);
    const log = () => logRef.current();
    const note = () => setNoteSheet(true);
    const loc = () => setLocSheet(true);
    const lost = () => setLostStep("ask");
    window.addEventListener("teg:lead-schedule", sched);
    window.addEventListener("teg:lead-log", log);
    window.addEventListener("teg:lead-note", note);
    window.addEventListener("teg:lead-location", loc);
    window.addEventListener("teg:lead-lost", lost);
    return () => {
      window.removeEventListener("teg:lead-schedule", sched);
      window.removeEventListener("teg:lead-log", log);
      window.removeEventListener("teg:lead-note", note);
      window.removeEventListener("teg:lead-location", loc);
      window.removeEventListener("teg:lead-lost", lost);
      window.dispatchEvent(new Event("teg:lead-close"));
      // If we unmount while a field was focused, make sure the nav comes back.
      window.dispatchEvent(new Event("teg:nav-show"));
    };
  }, [lead.phone, lead.email, waNumber]);
  // Keep a live handle on the log action so the "+" menu always logs the
  // current attempt (the listener above is registered once).
  const logRef = useRef<() => void>(() => {});

  const EMAIL_TEMPLATES = [
    { name: "First touch", subject: "Following up on your enquiry", body: `Hi ${firstName},\n\nThanks for getting in touch — I'd love to help. When's a good time for a quick chat this week?\n\nBest,` },
    { name: "Chasing a reply", subject: "Still happy to help", body: `Hi ${firstName},\n\nJust circling back on my last message — I'm around if you have any questions. Would a quick call suit?\n\nBest,` },
    { name: brand.conversionVerb, subject: `Let's get you booked in`, body: `Hi ${firstName},\n\nGreat news — I can get you booked in. What day suits best?\n\nBest,` },
  ];

  function togglePanel(which: "call" | "email" | "sched") {
    setPanel((p) => (p === which ? null : which));
  }

  async function handleLogAttempt() {
    const next = attemptNext[lead.stage];
    if (!next || busy) return;
    setBusy(true);
    await Promise.resolve(onStage(next));
    setBusy(false);
    setPanel(null);
    setEmailLogAsk(false);
    if (onFollowUp) setFollowAsk(true);
  }
  logRef.current = handleLogAttempt;

  async function pickFollow(at: Date) {
    if (!onFollowUp || savingFollow) return;
    setSavingFollow(true);
    at.setHours(8, 0, 0, 0);
    await onFollowUp(at.toISOString());
    setSavingFollow(false);
    setFollowAsk(false);
  }

  async function saveNote() {
    const t = noteText.trim();
    if (!t || savingNote) return;
    setSavingNote(true);
    await onAddNote(t);
    setSavingNote(false);
    setNoteText("");
  }

  async function sendEmail() {
    if (!emailSubject.trim() || !emailBody.trim() || sendingEmail) return;
    if (!emailConnected || !onSendEmail) {
      setEmailToast("Draft ready ✓ — connect your email (Profile → Email sending) to send from here.");
      setTimeout(() => setEmailToast(""), 5000);
      return;
    }
    setSendingEmail(true);
    const res = await onSendEmail(emailSubject.trim(), emailBody.trim());
    setSendingEmail(false);
    if (res.ok) {
      setEmailToast("");
      if (attemptNext[lead.stage]) setEmailLogAsk(true);
      else {
        setEmailSubject("");
        setEmailBody("");
        setPanel(null);
      }
    } else {
      setEmailToast(res.error ?? "Couldn't send — please try again.");
      setTimeout(() => setEmailToast(""), 6000);
    }
  }

  async function confirmBooking() {
    if (!pickedDay || !pickedTime || booking) return;
    const [h, m] = pickedTime.split(":").map(Number);
    const dt = new Date(pickedDay);
    dt.setHours(h, m, 0, 0);
    setBooking(true);
    await onBook(dt.toISOString());
    setBooking(false);
    setPanel(null);
  }

  // ── Mark-as-lost helpers (unchanged behaviour) ──
  async function markLostWithReason(reason: string) {
    if (savingLost) return;
    setSavingLost(true);
    await onAddNote(`Marked lost — ${reason}`);
    onStage("lost");
    setSavingLost(false);
    onClose();
  }
  async function addToNurture() {
    if (!nurtureReason || savingLost) return;
    setSavingLost(true);
    await onAddNote(`Added to marketing funnel — ${nurtureReason}`);
    onStage("nurture");
    setSavingLost(false);
    // Offer the personal follow-up before closing — the funnel emails run
    // either way; a date ALSO brings the lead back for a real call.
    if (onSnooze) setLostStep("funneldate");
    else { setLostStep("done"); setTimeout(onClose, 1600); }
  }
  async function saveForLater(
    until: Date,
    mode: "nurture" | "lost" = "nurture",
    reason?: string
  ) {
    if (!onSnooze || savingSnooze) return;
    const d = new Date(until);
    if (d.getTime() <= Date.now()) d.setTime(Date.now() + 60 * 60 * 1000);
    setSavingSnooze(true);
    await onSnooze(d.toISOString(), reason ?? (lostReason || "Not the right time"), mode);
    setSavingSnooze(false);
  }
  function monthsFromNow(n: number): Date {
    const d = new Date();
    d.setMonth(d.getMonth() + n);
    d.setHours(9, 0, 0, 0);
    return d;
  }

  const attemptNo =
    lead.stage === "new" ? 1 : lead.stage === "attempt1" ? 2 : lead.stage === "attempt2" ? 3 : 3;

  // Progress pill — three contact attempts, then nurture as the fourth stage.
  const attemptsDone =
    lead.stage === "new"
      ? 0
      : lead.stage === "attempt1"
        ? 1
        : lead.stage === "attempt2"
          ? 2
          : lead.stage === "attempt3"
            ? 3
            : ["nurture", "converted", "pushed"].includes(lead.stage)
              ? 4
              : 0;
  const progressCaption =
    lead.stage === "converted" || lead.stage === "pushed"
      ? "Booked ✓"
      : lead.stage === "nurture"
        ? "In nurture"
        : lead.stage === "lost"
          ? "Lost"
          : attemptsDone === 0
            ? "Not contacted yet"
            : `Attempt ${Math.min(attemptsDone, 3)} of 3`;

  // `entered` drops the entrance animation class once it's finished playing.
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 420);
    return () => clearTimeout(t);
  }, []);

  // Expand-from-the-card (FLIP): if we were handed the tapped card's rect, the
  // file starts pinned to that card (translated + scaled down) and springs out
  // to fill the screen with a little overshoot, fading in as it grows.
  const sheetRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = sheetRef.current;
    if (!el || !origin) return;
    const reset = () => {
      el.style.transition = "";
      el.style.transform = "";
      el.style.opacity = "";
      el.style.transformOrigin = "";
    };
    const last = el.getBoundingClientRect();
    if (last.width === 0 || last.height === 0) return;
    el.style.transformOrigin = "top left";
    el.style.transform = `translate(${origin.left - last.left}px, ${origin.top - last.top}px) scale(${origin.width / last.width}, ${origin.height / last.height})`;
    el.style.opacity = "0";
    el.style.transition = "none";
    void el.getBoundingClientRect(); // flush the "before" state
    const raf = requestAnimationFrame(() => {
      el.style.transition =
        "transform 0.52s cubic-bezier(0.2,1.34,0.3,1), opacity 0.32s ease-out";
      el.style.transform = "translate(0px, 0px) scale(1)";
      el.style.opacity = "1";
    });
    const done = setTimeout(() => {
      if (sheetRef.current) sheetRef.current.style.transition = "";
    }, 600);
    // Reset on cleanup so a StrictMode double-mount re-measures the real
    // (untransformed) sheet rather than the shrunk one.
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(done);
      reset();
    };
  }, [origin]);

  /* Swipe the sheet down to dismiss it.
   *
   * On a phone the reflex is to grab a full-screen thing and throw it away —
   * so it tracks the finger the whole way rather than waiting for release to
   * decide. A short pull springs back; a long one (or a decisive flick) closes.
   *
   * Only starts from the top of the sheet's scroll: dragging in the middle of
   * a scrolled list has to scroll the list, not close the file. That single
   * check is the difference between "natural" and "keeps closing by accident".
   */
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragFrom = useRef<number | null>(null);
  const lastMove = useRef({ y: 0, t: 0, v: 0 });
  const scroller = useRef<HTMLElement | null>(null);

  function onSheetTouchStart(e: React.TouchEvent) {
    // Find the scrollable region the finger is inside, if any.
    let node = e.target as HTMLElement | null;
    scroller.current = null;
    while (node && node !== sheetRef.current) {
      if (node.scrollHeight > node.clientHeight + 1) {
        const oy = getComputedStyle(node).overflowY;
        if (oy === "auto" || oy === "scroll") { scroller.current = node; break; }
      }
      node = node.parentElement;
    }
    // Mid-list, the gesture belongs to the list.
    if (scroller.current && scroller.current.scrollTop > 0) {
      dragFrom.current = null;
      return;
    }
    const t = e.touches[0];
    dragFrom.current = t.clientY;
    lastMove.current = { y: t.clientY, t: e.timeStamp, v: 0 };
    setDragging(true);
  }

  function onSheetTouchMove(e: React.TouchEvent) {
    if (dragFrom.current == null) return;
    const t = e.touches[0];
    const dy = t.clientY - dragFrom.current;
    const dt = e.timeStamp - lastMove.current.t;
    if (dt > 0) lastMove.current.v = (t.clientY - lastMove.current.y) / dt;
    lastMove.current = { y: t.clientY, t: e.timeStamp, v: lastMove.current.v };
    // Downward only. Pulling up does nothing rather than lifting the sheet
    // off the bottom of the screen.
    setDragY(dy > 0 ? dy : 0);
  }

  function onSheetTouchEnd() {
    if (dragFrom.current == null) return;
    const h = sheetRef.current?.getBoundingClientRect().height ?? 600;
    const far = dragY > h * 0.28;
    const flicked = lastMove.current.v > 0.6;
    dragFrom.current = null;
    setDragging(false);
    if (far || flicked) {
      // Carry it the rest of the way, then unmount — closing from halfway up
      // looks like it snapped rather than was thrown.
      setDragY(h);
      setTimeout(() => onClose(), 190);
    } else {
      setDragY(0);
    }
  }

  return (
    <div
      // z-[80] keeps the sheet + its dimmed backdrop BELOW the dashboard's
      // bottom nav (z-90) on mobile, so the nav persists over the sheet and
      // morphs into this lead's actions. Tapping the dimmed area closes.
      className="fixed inset-0 z-[80] flex items-end justify-center bg-gray-950/60 p-0 backdrop-blur-md sm:items-center sm:bg-gray-900/50 sm:p-6 sm:backdrop-blur-none"
      style={{
        opacity: dragY > 0 ? Math.max(0.25, 1 - dragY / 520) : 1,
        transition: dragging ? "none" : "opacity 0.22s ease-out",
      }}
      onClick={onClose}
    >
      {/* X (dismiss) — mobile only, floating on the blurred backdrop above the
          sheet's rounded top. Hidden while an overlay (schedule / note / lost)
          is up, so it can't be confused with that overlay's own close. */}
      {!anyOverlay && (
        <div className="pointer-events-none absolute inset-x-0 top-[calc(env(safe-area-inset-top)+20px)] z-10 flex items-center justify-end px-6 sm:hidden">
          <button
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            aria-label="Close"
            className="pointer-events-auto flex h-12 w-12 items-center justify-center text-white transition-transform active:scale-90"
          >
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      )}

      <div
        ref={sheetRef}
        // Mobile: a tall bottom sheet that stops just short of the top so the
        // blurred, darkened dashboard shows through above it — making it read
        // as a sheet. Desktop: the centred dialog. When opened from a card it
        // expands out of that card (FLIP effect above); otherwise modal-pop.
        className={`relative flex h-[calc(100dvh-env(safe-area-inset-top)-78px)] w-full max-w-5xl flex-col overflow-hidden rounded-t-[28px] bg-white sm:h-auto sm:max-h-[94vh] sm:rounded-3xl ${entered || origin ? "" : "modal-pop"}`}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onSheetTouchStart}
        onTouchMove={onSheetTouchMove}
        onTouchEnd={onSheetTouchEnd}
        onTouchCancel={onSheetTouchEnd}
        style={
          dragY > 0 || dragging
            ? {
                transform: `translateY(${dragY}px)`,
                transition: dragging ? "none" : "transform 0.19s ease-out",
              }
            : undefined
        }
      >
        {/* Header — mobile: X on top; below it the source icon (no box, sized
            to the three text lines) with name / received-via / date grouped
            beside it, all left-aligned. */}
        {/* Header — mobile: the name + source sit right at the top of the sheet
            (the tick/X live OUTSIDE, on the backdrop above — see below). */}
        <div className="px-6 pt-9 sm:hidden">
          <div className="flex items-center gap-3.5">
            <SourceIcon source={lead.source} size={54} className="shrink-0" />
            <div className="min-w-0 leading-tight">
              <div className="flex flex-wrap items-center gap-2">
                <InlineName value={lead.name} onSave={(v) => onUpdateFields?.({ name: v })} />
                <StagePill lead={lead} brand={brand} />
              </div>
              <p className="mt-1 text-[13px] text-gray-500">
                Received via <span className="capitalize">{lead.source}</span>
              </p>
              <p className="text-[12px] text-gray-400">{fullDate(lead.receivedAt)}</p>
            </div>
          </div>
        </div>

        {/* Header — desktop (inline, unchanged) */}
        <div className="hidden items-start justify-between gap-4 px-8 pt-7 sm:flex">
          <div className="flex items-start gap-3.5">
            <div
              className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
              style={{ backgroundColor: brand.accentSoft }}
            >
              <SourceIcon source={lead.source} size={22} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <InlineName value={lead.name} onSave={(v) => onUpdateFields?.({ name: v })} />
                <StagePill lead={lead} brand={brand} />
              </div>
              <p className="mt-1.5 text-[13px] text-gray-400">
                Received via {lead.source} · {fullDate(lead.receivedAt)}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {/* Body — one column on mobile (grid-cols-1 bounds the track so nothing
            overflows sideways), two columns on desktop. */}
        <div className="grid flex-1 grid-cols-1 gap-7 overflow-x-hidden overflow-y-auto px-7 pt-6 pb-28 sm:px-8 lg:grid-cols-[1.6fr_1fr] lg:pb-6">
          {/* MAIN — on mobile this is a flex column whose children are
              re-ordered (inquiry → log → notes → more details) without moving
              the DOM; desktop reverts to the normal block flow. */}
          <div className="flex min-w-0 flex-col lg:block">
            {/* Progress pill — three contact attempts, then nurture as the
                fourth stage. Fills as attempts are logged. (Location now lives
                under "More details".) */}
            <div className="order-1 mt-4 lg:hidden">
              <div className="mb-2 flex items-center justify-between px-0.5">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Progress</span>
                <span className="text-[12px] font-medium text-gray-600">{progressCaption}</span>
              </div>
              <div className="flex gap-1.5">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-[18px] flex-1 rounded-full transition-colors"
                    style={{ backgroundColor: i < attemptsDone ? (i === 3 ? "#d97706" : "#111827") : "#e5e7eb" }}
                  />
                ))}
              </div>
              <div className="mt-1.5 flex text-[10px] font-medium text-gray-400">
                {["Try 1", "Try 2", "Try 3", "Nurture"].map((l) => (
                  <span key={l} className="flex-1 text-center">{l}</span>
                ))}
              </div>
            </div>

            {/* Mobile: a single "More details" toggle reveals the contact facts,
                enquiry and activity — hidden by default to keep it to one page.
                Desktop always shows everything, so the toggle is hidden there. */}
            <button
              onClick={() => setMobileDetails((v) => !v)}
              className="order-6 mb-4 mt-6 flex w-full items-center justify-center gap-1.5 rounded-xl border border-gray-200 py-2 text-[13px] font-medium text-gray-500 lg:mt-0 lg:hidden"
            >
              {mobileDetails ? "Hide details" : "More details"}
              <svg
                className={`h-4 w-4 transition-transform ${mobileDetails ? "rotate-180" : ""}`}
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
              </svg>
            </button>

            {/* Editable facts — hidden on mobile unless "More details" is open */}
            <div
              className={`order-7 gap-3 sm:grid-cols-2 lg:grid ${mobileDetails ? "grid" : "hidden"}`}
            >
              <InlineField
                label="Phone"
                icon={<PhoneIcon />}
                value={lead.phone}
                type="tel"
                placeholder="Add a number…"
                onSave={(v) => onUpdateFields?.({ phone: v })}
              />
              <InlineField
                label="Email"
                icon={<MailIcon />}
                value={lead.email}
                type="email"
                placeholder="Add an email…"
                onSave={(v) => onUpdateFields?.({ email: v })}
              />
              <AddressField lead={lead} onSave={onUpdateFields} />
            </div>

            {/* Interested in — hidden on mobile unless "More details" is open */}
            <div
              className={`order-8 mt-4 overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 lg:block ${mobileDetails ? "block" : "hidden"}`}
            >
              <button
                onClick={() => setShowInterested((v) => !v)}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
              >
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    Interested in
                  </p>
                  <p className="mt-0.5 truncate text-[15px] font-medium text-gray-800">
                    {whatFor(lead)}
                  </p>
                </div>
                <svg
                  className={`ml-auto h-4 w-4 shrink-0 text-gray-400 transition-transform ${showInterested ? "rotate-180" : ""}`}
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
                </svg>
              </button>
              <Expand open={showInterested}>
                <div className="space-y-3 px-4 pb-4 pt-1 text-sm">
                  <QaRow q="Their enquiry" a={whatFor(lead)} />
                  {lead.adName && <QaRow q="Came from" a={lead.adName} />}
                  {lead.note && lead.note !== whatFor(lead) && <QaRow q="Note on the form" a={lead.note} />}
                  <MagnetRow lead={lead} accent={accent} />
                </div>
              </Expand>
            </div>

            {/* Get in touch — desktop only; on mobile these live in the fixed
                candidate action bar at the bottom. */}
            <div className="mt-6 hidden items-center gap-3 lg:flex">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Get in touch</span>
              <span className="h-px flex-1 bg-gray-100" />
            </div>
            <div className="mt-3 hidden grid-cols-3 gap-3 lg:grid">
              <Tool active={panel === "call"} accent={accent} onClick={() => togglePanel("call")} icon={<PhoneIcon />} label="Call" />
              {/* Mobile: WhatsApp them directly (opens their chat). Desktop: the
                  email composer. */}
              <a
                href={waNumber ? `https://wa.me/${waNumber}` : undefined}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  if (!waNumber) e.preventDefault();
                }}
                aria-disabled={!waNumber}
                className={`flex flex-col items-center gap-2 rounded-2xl border border-gray-200 py-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 lg:hidden ${
                  waNumber ? "" : "pointer-events-none opacity-40"
                }`}
              >
                <WhatsAppIcon /> WhatsApp
              </a>
              <button
                onClick={() => togglePanel("email")}
                className={`hidden flex-col items-center gap-2 rounded-2xl border py-4 text-sm font-semibold transition lg:flex ${
                  panel === "email" ? "text-white" : "border-gray-200 text-gray-700 hover:bg-gray-50"
                }`}
                style={panel === "email" ? { backgroundColor: accent, borderColor: accent } : undefined}
              >
                <MailIcon /> Email
              </button>
              <Tool active={panel === "sched"} accent={accent} onClick={() => togglePanel("sched")} icon={<CalIcon />} label="Schedule" />
            </div>

            {/* Call panel */}
            <Expand open={panel === "call"}>
              <div className="mt-3 rounded-2xl border border-gray-200 bg-gray-50 p-5">
                <a href={`tel:${lead.phone}`} className="inline-flex items-center gap-2.5 text-[17px] font-semibold" style={{ color: accent }}>
                  <PhoneIcon /> {lead.phone || "No number yet"}
                </a>
                <p className="mt-2 text-sm text-gray-500">Give {firstName} a ring, then log how it went.</p>
                {attemptNext[lead.stage] && (
                  <div className="mt-4">
                    <BigBtn primary accent={accent} disabled={busy} onClick={handleLogAttempt}>
                      {busy ? "Logging…" : `Log contact attempt ${attemptNo}`}
                    </BigBtn>
                  </div>
                )}
              </div>
            </Expand>

            {/* Email panel */}
            <Expand open={panel === "email"}>
              <div className="mt-3 rounded-2xl border border-gray-200 bg-gray-50 p-5">
                {emailLogAsk ? (
                  <div className="text-center">
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-xl text-green-600">✓</div>
                    <p className="font-semibold text-gray-800">Email sent</p>
                    <p className="mt-1 text-sm text-gray-500">Log this as contact attempt {attemptNo}?</p>
                    <div className="mt-4 flex justify-center gap-2.5">
                      <button
                        onClick={async () => { setEmailSubject(""); setEmailBody(""); await handleLogAttempt(); }}
                        className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white"
                        style={{ backgroundColor: accent }}
                      >
                        Yes, log it
                      </button>
                      <button onClick={() => { setEmailLogAsk(false); setPanel(null); setEmailSubject(""); setEmailBody(""); }} className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50">
                        Not this time
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-sm font-medium text-gray-700">✉ <span className="text-gray-500">{lead.email || "No email yet"}</span></p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {EMAIL_TEMPLATES.map((t) => (
                        <button
                          key={t.name}
                          onClick={() => { setEmailSubject(t.subject); setEmailBody(t.body); }}
                          className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
                        >
                          {t.name}
                        </button>
                      ))}
                    </div>
                    <input value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} placeholder="Subject" className="mt-3 w-full rounded-xl border border-gray-200 bg-white p-3 text-sm outline-none focus:border-gray-900" />
                    <textarea value={emailBody} onChange={(e) => setEmailBody(e.target.value)} rows={6} placeholder="Write your email, or pick a template…" className="mt-2 w-full rounded-xl border border-gray-200 bg-white p-3 text-sm outline-none focus:border-gray-900" />
                    <div className="mt-3">
                      <BigBtn primary accent={accent} disabled={!emailSubject.trim() || !emailBody.trim() || sendingEmail} onClick={sendEmail}>
                        {sendingEmail ? "Sending…" : "Send email"}
                      </BigBtn>
                    </div>
                    {emailToast && <p className="mt-2 text-center text-xs text-gray-500">{emailToast}</p>}
                  </>
                )}
              </div>
            </Expand>

            {/* Schedule panel */}
            <Expand open={panel === "sched"}>
              <div className="mt-3 rounded-2xl border border-gray-200 bg-gray-50 p-5">
                {booked && (
                  <p className="mb-4 rounded-xl bg-green-50 p-3.5 text-sm font-medium text-green-700">
                    📅 Booked for {apptLabel(lead.appointmentAt!)}
                  </p>
                )}
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">Pick a day</p>
                <InlineCalendar value={pickedDay} accent={accent} onPick={setPickedDay} />
                {pickedDay && <div className="mt-4"><TimePicker value={pickedTime} accent={accent} onChange={setPickedTime} /></div>}
                <div className="mt-4">
                  <BigBtn primary accent={accent} disabled={!pickedDay || !pickedTime || booking} onClick={confirmBooking}>
                    {booking ? "Saving…" : booked ? "Rearrange" : brand.conversionVerb}
                  </BigBtn>
                </div>
                {booked && (
                  <button onClick={onCancelBooking} className="mt-2 w-full rounded-2xl py-2.5 text-sm font-medium text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                    Cancel booking
                  </button>
                )}
              </div>
            </Expand>

            {/* Progressive next step */}
            <div className="order-3 mt-6">
              {followAsk && onFollowUp ? (
                <NextCard tone="accent" accent={accent} tick title={`Logged. When shall we follow up with ${firstName}?`} body="We'll rest the lead and bring it back in your follow-ups on that day.">
                  <div className="flex flex-wrap gap-2">
                    <FollowChip label="Tomorrow" days={1} onPick={pickFollow} disabled={savingFollow} />
                    <FollowChip label="In 3 days" days={3} onPick={pickFollow} disabled={savingFollow} />
                    <FollowChip label="Next week" days={7} onPick={pickFollow} disabled={savingFollow} />
                  </div>
                  <div className="mt-3">
                    <InlineCalendar value={null} accent={accent} onPick={pickFollow} />
                  </div>
                </NextCard>
              ) : lead.stage === "converted" ? (
                <NextCard tone="good" title={`${brand.conversionLabel} booked 🎉 — one step left`} body={`Send ${firstName} straight to ${brand.crmName} so nothing slips.`}>
                  {booked && <p className="mb-3 rounded-xl bg-green-50 py-2.5 text-center text-sm font-medium text-green-700">📅 {apptLabel(lead.appointmentAt!)}</p>}
                  <BigBtn primary accent={accent} disabled={pushing} onClick={onPush}>
                    {pushing ? "Pushing…" : `Push to ${brand.crmName}`}
                  </BigBtn>
                  <button onClick={() => setPanel("sched")} className="mt-2 w-full rounded-2xl py-2.5 text-sm font-medium text-gray-500 hover:bg-gray-50">
                    {booked ? "Rearrange or cancel" : "Set a date"}
                  </button>
                </NextCard>
              ) : lead.stage === "pushed" ? (
                <NextCard tone="good" title={`In ${brand.crmName} ✓`} body={booked ? apptLabel(lead.appointmentAt!) : "This lead's been handed over to your CRM."}>
                  {onRexReset && brand.crmName === "REX" && (
                    <button onClick={async () => { if (resettingRex) return; setResettingRex(true); await onRexReset(); setResettingRex(false); }} disabled={resettingRex} className="w-full rounded-2xl border border-gray-200 bg-white py-2.5 text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50">
                      {resettingRex ? "Checking REX…" : `Deleted them in ${brand.crmName}? Reset the file`}
                    </button>
                  )}
                </NextCard>
              ) : lead.stage === "attempt3" ? (
                // Desktop only — on mobile it's redundant with the progress pill
                // and the "+" menu's add-to-nurture path.
                <div className="hidden lg:block">
                  <NextCard tone="plain" accent={accent} title="Three tries, no answer" body={`Keep ${firstName} warm with the marketing funnel — automated follow-ups until the timing's right.`}>
                    <BigBtn primary accent={accent} disabled={busy} onClick={async () => { setBusy(true); await Promise.resolve(onStage("nurture")); setBusy(false); }}>
                      {busy ? "Sending…" : "Send to marketing funnel"}
                    </BigBtn>
                  </NextCard>
                </div>
              ) : lead.stage === "nurture" ? (
                <NextCard tone="plain" accent={accent} title="In the marketing funnel" body={`${firstName} is getting our follow-up sequence. Reopen any time to pick things back up.`}>
                  <BigBtn accent={accent} onClick={() => onStage("new")}>Reopen lead</BigBtn>
                </NextCard>
              ) : attemptNext[lead.stage] ? (
                // Desktop only — on mobile it duplicated the Log Attempt
                // button, so it's dropped there (the standalone one below
                // handles logging).
                <div className="hidden lg:block">
                  <NextCard tone="plain" accent={accent} num={attemptNo} title={`Next step — reach out to ${firstName}`} body="Fastest route: give them a quick call while the lead's hot, then log the attempt." hint="Speed wins — leads called within 30 mins are far more likely to book in.">
                    <BigBtn primary accent={accent} onClick={() => setPanel("call")}>
                      {`Log contact attempt ${attemptNo}`}
                    </BigBtn>
                  </NextCard>
                </div>
              ) : null}

              {lead.stage === "lost" && !lead.archivedAt && (
                <div className="mt-3"><BigBtn accent={accent} onClick={() => onStage("new")}>Reopen lead</BigBtn></div>
              )}
            </div>

            {/* Activity timeline — mobile (desktop keeps it in the right rail).
                All actions (log / note / location / lost) live in the bottom
                nav's "+" menu — the file itself is read-only. */}
            <div className="order-4 mt-7 lg:hidden">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Activity</span>
              </div>
              <ol className="mt-2 rounded-2xl border border-gray-200 px-2 py-1">
                {[...events].reverse().slice(0, showAllEvents ? undefined : 4).map((e, i) => {
                  const idx = events.length - 1 - i;
                  return (
                    <li key={idx}>
                      <button onClick={() => setOpenEvent(openEvent === idx ? null : idx)} className="relative flex w-full items-start gap-3 rounded-xl px-2.5 py-2.5 pl-8 text-left transition active:bg-gray-50">
                        <span className="absolute left-3 top-4 h-2 w-2 rounded-full ring-2 ring-white" style={{ backgroundColor: i === 0 ? "#111827" : "#D1D5DB" }} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline gap-2">
                            <span className="truncate text-sm font-medium text-gray-800">{e.label}</span>
                            <span className="ml-auto shrink-0 text-[11px] tabular-nums text-gray-400">{shortDate(e.at)}</span>
                          </span>
                          <Expand open={openEvent === idx}>
                            <span className="mt-1 block text-xs text-gray-500">{fullDate(e.at)}</span>
                          </Expand>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
              {events.length > 4 && (
                <button onClick={() => setShowAllEvents((v) => !v)} className="mt-1.5 px-1 text-xs font-medium text-gray-400">
                  {showAllEvents ? "Show less" : `Show all ${events.length} ↓`}
                </button>
              )}
            </div>

            {/* Notes — mobile: read-only list. Adding a note happens from the
                "+" menu in the bottom nav, not here. */}
            <div className="order-5 mt-6 lg:hidden">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Notes</span>
                <span className="text-[11px] font-medium text-gray-400">{notes.length}</span>
              </div>
              {notes.length > 0 ? (
                <div className="mt-2 space-y-2">
                  {[...notes].reverse().map((n, i) => (
                    <div key={i} className="rounded-xl bg-gray-50 p-3">
                      <p className="text-[13.5px] text-gray-700">{n.text}</p>
                      <p className="mt-1.5 text-[11px] text-gray-400">{fullDate(n.at)}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 rounded-xl bg-gray-50 px-3 py-4 text-[13.5px] text-gray-400">
                  No notes yet — add one from the + menu below.
                </p>
              )}
            </div>

            {/* Archive / mark lost */}
            <div className="order-9 mt-5 flex items-center justify-center gap-4">
              {canWork && !lead.archivedAt && (
                <button onClick={() => { setNurtureReason(""); setLostReason(""); setLostStep("ask"); }} className="rounded-xl px-4 py-2 text-sm font-medium text-gray-400 transition hover:bg-red-50 hover:text-red-600">
                  Mark as lost
                </button>
              )}
              {onArchive && lead.archivedAt && (
                <BigBtn accent={accent} onClick={() => onArchive(false)}>
                  {lead.resurfaceAt ? "Bring back now (don't wait)" : "Bring back to the funnel"}
                </BigBtn>
              )}
              {onArchive && !lead.archivedAt && (lead.stage === "pushed" || lead.stage === "lost") && (
                <button onClick={() => onArchive(true)} className="rounded-xl px-4 py-2 text-sm font-medium text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                  Archive this file
                </button>
              )}
            </div>
          </div>

          {/* RIGHT RAIL */}
          <div className="space-y-5">
            {/* Activity — mobile shows this in-body (above); desktop only here */}
            <div className="hidden rounded-2xl border border-gray-200 lg:block">
              <div className="flex items-center gap-2 px-4 pb-2 pt-4">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Activity</span>
                <span className="ml-auto text-[11px] font-medium text-gray-400">{events.length} events</span>
              </div>
              <ol className="px-2 pb-2">
                {[...events].reverse().slice(0, showAllEvents ? undefined : 4).map((e, i) => {
                  const idx = events.length - 1 - i;
                  return (
                    <li key={idx}>
                      <button onClick={() => setOpenEvent(openEvent === idx ? null : idx)} className="relative flex w-full items-start gap-3 rounded-xl px-2.5 py-2.5 pl-8 text-left transition hover:bg-gray-50">
                        <span className="absolute left-3 top-4 h-2 w-2 rounded-full ring-2 ring-white" style={{ backgroundColor: i === 0 ? accent : "#D1D5DB" }} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline gap-2">
                            <span className="truncate text-sm font-medium text-gray-800">{e.label}</span>
                            <span className="ml-auto shrink-0 text-[11px] tabular-nums text-gray-400">{shortDate(e.at)}</span>
                          </span>
                          <Expand open={openEvent === idx}>
                            <span className="mt-1 block text-xs text-gray-500">{fullDate(e.at)}</span>
                          </Expand>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
              {events.length > 4 && (
                <div className="px-3 pb-3">
                  <button onClick={() => setShowAllEvents((v) => !v)} className="text-xs font-medium text-gray-400 hover:text-gray-700">
                    {showAllEvents ? "Show less" : `Show all ${events.length} ↓`}
                  </button>
                </div>
              )}
            </div>

            {/* Notes — desktop only (mobile has its own bigger block above) */}
            <div className="hidden rounded-2xl border border-gray-200 lg:block">
              <div className="flex items-center gap-2 px-4 pb-2 pt-4">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Notes</span>
                <span className="ml-auto text-[11px] font-medium text-gray-400">{notes.length}</span>
              </div>
              <div className="space-y-2 px-3 pb-3">
                {notes.length === 0 ? (
                  <p className="px-1.5 py-2 text-sm text-gray-400">No notes yet — add one below.</p>
                ) : (
                  [...notes].reverse().map((n, i) => (
                    <div key={i} className="rounded-xl bg-gray-50 p-3">
                      <p className="text-[13.5px] text-gray-700">{n.text}</p>
                      <p className="mt-1.5 text-[11px] text-gray-400">{fullDate(n.at)}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Always-on note bar — desktop only (mobile note box lives in-body) */}
        <div className="hidden items-center gap-3 border-t border-gray-100 bg-gray-50 px-6 py-4 sm:px-8 lg:flex">
          <span className="hidden text-xs font-medium text-gray-400 sm:block">Quick note</span>
          <input
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && saveNote()}
            placeholder="Type a note and press enter — no clicking around…"
            className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-gray-900"
          />
          <button
            onClick={saveNote}
            disabled={!noteText.trim() || savingNote}
            aria-label="Add note"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl text-white transition hover:opacity-90 disabled:opacity-40"
            style={{ backgroundColor: accent }}
          >
            ＋
          </button>
        </div>
      </div>

      {/* Schedule — its own bottom sheet. The X (cancel) and tick (save, brand
          colour) sit OUTSIDE the sheet on the blurred backdrop; the calendar
          sits directly on the sheet (no box-in-a-box) and a bit bigger. */}
      {schedSheet && (
        <div
          className="fixed inset-0 z-[108] flex items-end justify-center bg-gray-900/50 backdrop-blur-sm p-0 sm:items-center sm:p-6"
          onClick={(e) => { e.stopPropagation(); setSchedSheet(false); }}
        >
          {/* Cancel (X) — top-left, on the backdrop */}
          <button
            onClick={(e) => { e.stopPropagation(); setSchedSheet(false); }}
            aria-label="Cancel"
            className="absolute left-4 top-[calc(env(safe-area-inset-top)+16px)] z-10 flex h-12 w-12 items-center justify-center rounded-full bg-white text-gray-700 shadow-lg active:scale-95"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
          {/* Save (tick) — top-right, brand colour, on the backdrop */}
          <button
            onClick={async (e) => { e.stopPropagation(); await confirmBooking(); setSchedSheet(false); }}
            disabled={!pickedDay || !pickedTime || booking}
            aria-label="Save"
            className="absolute right-4 top-[calc(env(safe-area-inset-top)+16px)] z-10 flex h-12 w-12 items-center justify-center rounded-full text-white shadow-lg transition active:scale-95 disabled:opacity-40"
            style={{ backgroundColor: accent }}
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4 10-11" />
            </svg>
          </button>

          <div
            className="w-full max-w-2xl animate-[sheet-up_0.46s_cubic-bezier(0.34,1.56,0.64,1)] rounded-t-3xl bg-white px-6 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-7 sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-center text-lg font-semibold tracking-tight text-gray-900">
              {booked ? "Rearrange the time" : "Pick a day & time"}
            </p>
            {booked && (
              <p className="mx-auto mt-3 w-fit rounded-xl bg-green-50 px-4 py-2 text-sm font-medium text-green-700">
                📅 Booked for {apptLabel(lead.appointmentAt!)}
              </p>
            )}
            <div className="mt-5">
              <InlineCalendar big value={pickedDay} accent={accent} onPick={setPickedDay} />
            </div>
            {pickedDay && (
              <div className="mt-6">
                <TimePicker value={pickedTime} accent={accent} onChange={setPickedTime} />
              </div>
            )}
            {booked && (
              <button
                onClick={() => { onCancelBooking(); setSchedSheet(false); }}
                className="mt-5 w-full rounded-2xl py-2.5 text-sm font-medium text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                Cancel booking
              </button>
            )}
          </div>
        </div>
      )}

      {/* Add-a-note sheet — opened from the "+" menu. X cancels, tick saves. */}
      {noteSheet && (
        <div
          className="fixed inset-0 z-[108] flex items-end justify-center bg-gray-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-6"
          onClick={(e) => { e.stopPropagation(); setNoteSheet(false); }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setNoteSheet(false); }}
            aria-label="Cancel"
            className="absolute left-4 top-[calc(env(safe-area-inset-top)+16px)] z-10 flex h-12 w-12 items-center justify-center rounded-full bg-white text-gray-700 shadow-lg active:scale-95"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
          <button
            onClick={async (e) => { e.stopPropagation(); await saveNote(); setNoteSheet(false); }}
            disabled={!noteText.trim() || savingNote}
            aria-label="Save note"
            className="absolute right-4 top-[calc(env(safe-area-inset-top)+16px)] z-10 flex h-12 w-12 items-center justify-center rounded-full text-white shadow-lg transition active:scale-95 disabled:opacity-40"
            style={{ backgroundColor: accent }}
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4 10-11" />
            </svg>
          </button>
          <div
            className="w-full max-w-2xl animate-[sheet-up_0.46s_cubic-bezier(0.34,1.56,0.64,1)] rounded-t-3xl bg-white px-6 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-7 sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-center text-lg font-semibold tracking-tight text-gray-900">Add a note</p>
            <textarea
              autoFocus
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={5}
              placeholder="Type your note…"
              className="mt-5 w-full rounded-2xl border border-gray-200 bg-white p-4 text-[15px] outline-none focus:border-gray-900"
            />
          </div>
        </div>
      )}

      {/* Add-location sheet — opened from the "+" menu. The address auto-saves;
          the tick just closes. */}
      {locSheet && (
        <div
          className="fixed inset-0 z-[108] flex items-end justify-center bg-gray-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-6"
          onClick={(e) => { e.stopPropagation(); setLocSheet(false); }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setLocSheet(false); }}
            aria-label="Done"
            className="absolute right-4 top-[calc(env(safe-area-inset-top)+16px)] z-10 flex h-12 w-12 items-center justify-center rounded-full text-white shadow-lg transition active:scale-95"
            style={{ backgroundColor: accent }}
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4 10-11" />
            </svg>
          </button>
          <div
            className="w-full max-w-2xl animate-[sheet-up_0.46s_cubic-bezier(0.34,1.56,0.64,1)] rounded-t-3xl bg-white px-6 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-7 sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-center text-lg font-semibold tracking-tight text-gray-900">Add location</p>
            <div className="mt-5">
              <AddressField lead={lead} onSave={onUpdateFields} />
            </div>
          </div>
        </div>
      )}

      {/* Mark-as-lost flow — heavy dark blur so the file behind is hidden, and
          a single white X on the backdrop (progressive: it only steps back out
          of this flow). The bottom nav is tucked away while it's open. */}
      {lostStep && (
        <div className="fixed inset-0 z-[110] flex items-end justify-center bg-gray-950/70 p-0 backdrop-blur-xl sm:items-center sm:p-6" onClick={(e) => { e.stopPropagation(); setLostStep(null); }}>
          {/* White X on the backdrop — obvious, and only closes this flow. */}
          <button
            onClick={(e) => { e.stopPropagation(); setLostStep(null); }}
            aria-label="Cancel"
            className="absolute right-5 top-[calc(env(safe-area-inset-top)+16px)] z-20 flex h-11 w-11 items-center justify-center text-white transition-transform active:scale-90 sm:hidden"
          >
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2.4"><path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
          <div className="modal-pop relative flex max-h-[92vh] min-h-[60vh] w-full max-w-3xl flex-col overflow-y-auto rounded-t-3xl bg-white p-6 pb-[calc(env(safe-area-inset-bottom)+28px)] sm:rounded-3xl sm:p-8" onClick={(e) => e.stopPropagation()}>
            {/* Desktop keeps the corner X inside the card. */}
            <button onClick={(e) => { e.stopPropagation(); setLostStep(null); }} className="absolute right-5 top-5 z-10 hidden rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 sm:block" aria-label="Cancel">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
            <div key={lostStep} className="flex flex-1 animate-[lost-slide_0.35s_cubic-bezier(0.22,1,0.36,1)] flex-col justify-center">
              {lostStep === "ask" && (
                <div className="mx-auto w-full max-w-md">
                  <GifCard src={LOST_GIF} emoji="🥲" tint="linear-gradient(135deg,#fef2f2,#fee2e2)" />
                  <h3 className="mt-5 text-center text-xl font-semibold">One that got away?</h3>
                  <p className="mt-2 text-center text-sm text-gray-500">Don&apos;t close the door just yet — want to keep {firstName} in the loop with our marketing follow-ups?</p>
                  <div className="mt-4 space-y-2">
                    <BigBtn primary accent={accent} onClick={() => setLostStep("funnel")}>Yes, add to marketing funnel</BigBtn>
                    <button onClick={() => setLostStep("reason")} className="w-full rounded-2xl py-2.5 text-sm font-medium text-gray-400 hover:text-gray-600">No, just mark it lost</button>
                  </div>
                </div>
              )}
              {lostStep === "reason" && (
                <div className="mx-auto w-full max-w-md">
                  <h3 className="text-center text-xl font-semibold">What happened with {firstName}?</h3>
                  <p className="mt-2 text-center text-sm text-gray-500">A quick reason helps us learn what&apos;s converting and what isn&apos;t.</p>
                  <div className="mt-5 space-y-2">
                    {lostReasons.map((reason) => (
                      <button key={reason} disabled={savingLost} onClick={() => { setLostReason(reason); if (!onSnooze) { markLostWithReason(reason); return; } setLostStep(warmReasons.has(reason) ? "date" : "lostdate"); }} className="flex w-full items-center justify-between rounded-2xl border border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-700 transition hover:border-gray-900 hover:bg-gray-50 disabled:opacity-50">
                        {reason}<span className="text-gray-300">→</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {lostStep === "date" && (
                <div className="mx-auto w-full max-w-lg">
                  <GifCard src="" emoji="🔥" tint="linear-gradient(135deg,#fff7ed,#ffedd5)" />
                  <h3 className="mt-5 text-center text-xl font-semibold">Keep {firstName} warm?</h3>
                  <p className="mt-2 text-center text-sm text-gray-500">Not a no — just a &quot;not yet&quot;. Pick when they said they&apos;d be ready and we&apos;ll bring them back as a fresh lead on the day — with a nudge to call.</p>
                  <p className="mt-5 text-center text-xs font-medium uppercase tracking-wide text-gray-400">Bring {firstName} back in</p>
                  <div className="mt-3 flex flex-wrap justify-center gap-2">
                    {[{ label: "1 month", m: 1 }, { label: "3 months", m: 3 }, { label: "6 months", m: 6 }, { label: "12 months", m: 12 }].map((p) => (
                      <button key={p.label} disabled={savingSnooze} onClick={() => saveForLater(monthsFromNow(p.m))} className="rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:border-gray-900 hover:bg-gray-50 disabled:opacity-50">{p.label}</button>
                    ))}
                  </div>
                  <p className="mt-5 text-center text-xs font-medium uppercase tracking-wide text-gray-400">…or pick the exact date</p>
                  <div className="mt-3"><InlineCalendar value={snoozeDay} accent={accent} onPick={(d) => { const dt = new Date(d); dt.setHours(9, 0, 0, 0); setSnoozeDay(dt); saveForLater(dt); }} /></div>
                  {savingSnooze && <p className="mt-3 text-center text-sm text-gray-400">Keeping warm…</p>}
                  <button disabled={savingLost || savingSnooze} onClick={() => markLostWithReason(lostReason || "Not the right time")} className="mt-3 w-full rounded-2xl py-2.5 text-sm font-medium text-gray-400 hover:text-gray-600 disabled:opacity-50">No date — just mark it lost</button>
                </div>
              )}
              {lostStep === "lostdate" && (
                <div className="mx-auto w-full max-w-lg">
                  <GifCard src="" emoji="📅" tint="linear-gradient(135deg,#f9fafb,#f3f4f6)" />
                  <h3 className="mt-5 text-center text-xl font-semibold">Marked as lost. One more try later?</h3>
                  <p className="mt-2 text-center text-sm text-gray-500">Pick a follow-up date and we&apos;ll bring {firstName} back as a fresh lead on the day — with a nudge to call. Or just leave it closed.</p>
                  <p className="mt-5 text-center text-xs font-medium uppercase tracking-wide text-gray-400">Follow up in</p>
                  <div className="mt-3 flex flex-wrap justify-center gap-2">
                    {[{ label: "1 month", m: 1 }, { label: "3 months", m: 3 }, { label: "6 months", m: 6 }, { label: "12 months", m: 12 }].map((p) => (
                      <button key={p.label} disabled={savingSnooze} onClick={() => saveForLater(monthsFromNow(p.m), "lost")} className="rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:border-gray-900 hover:bg-gray-50 disabled:opacity-50">{p.label}</button>
                    ))}
                  </div>
                  <p className="mt-5 text-center text-xs font-medium uppercase tracking-wide text-gray-400">…or pick the exact date</p>
                  <div className="mt-3"><InlineCalendar value={snoozeDay} accent={accent} onPick={(d) => { const dt = new Date(d); dt.setHours(9, 0, 0, 0); setSnoozeDay(dt); saveForLater(dt, "lost"); }} /></div>
                  {savingSnooze && <p className="mt-3 text-center text-sm text-gray-400">Booking the follow-up…</p>}
                  <button disabled={savingLost || savingSnooze} onClick={() => markLostWithReason(lostReason || "Not the right time")} className="mt-3 w-full rounded-2xl py-2.5 text-sm font-medium text-gray-400 hover:text-gray-600 disabled:opacity-50">No follow-up — just close it</button>
                </div>
              )}
              {lostStep === "funneldate" && (
                <div className="mx-auto w-full max-w-lg">
                  <GifCard src="" emoji="📬" tint="linear-gradient(135deg,#f0fdf4,#dcfce7)" />
                  <h3 className="mt-5 text-center text-xl font-semibold">In the funnel. Follow up personally too?</h3>
                  <p className="mt-2 text-center text-sm text-gray-500">The marketing emails do their thing either way — a date here also brings {firstName} back to you as a fresh lead for a proper call.</p>
                  <p className="mt-5 text-center text-xs font-medium uppercase tracking-wide text-gray-400">Follow up in</p>
                  <div className="mt-3 flex flex-wrap justify-center gap-2">
                    {[{ label: "1 month", m: 1 }, { label: "3 months", m: 3 }, { label: "6 months", m: 6 }, { label: "12 months", m: 12 }].map((p) => (
                      <button key={p.label} disabled={savingSnooze} onClick={() => saveForLater(monthsFromNow(p.m), "nurture", nurtureReason || undefined)} className="rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:border-gray-900 hover:bg-gray-50 disabled:opacity-50">{p.label}</button>
                    ))}
                  </div>
                  <p className="mt-5 text-center text-xs font-medium uppercase tracking-wide text-gray-400">…or pick the exact date</p>
                  <div className="mt-3"><InlineCalendar value={snoozeDay} accent={accent} onPick={(d) => { const dt = new Date(d); dt.setHours(9, 0, 0, 0); setSnoozeDay(dt); saveForLater(dt, "nurture", nurtureReason || undefined); }} /></div>
                  {savingSnooze && <p className="mt-3 text-center text-sm text-gray-400">Booking the follow-up…</p>}
                  <button disabled={savingSnooze} onClick={() => { setLostStep("done"); setTimeout(onClose, 1600); }} className="mt-3 w-full rounded-2xl py-2.5 text-sm font-medium text-gray-400 hover:text-gray-600 disabled:opacity-50">No thanks — the funnel&apos;s enough</button>
                </div>
              )}
              {lostStep === "funnel" && (
                <div className="grid gap-7 sm:grid-cols-2 sm:gap-8">
                  <div className="flex flex-col justify-center">
                    <GifCard src={FUNNEL_GIF} emoji="🙌" tint="linear-gradient(135deg,#f0fdf4,#dcfce7)" />
                    <h3 className="mt-5 text-xl font-semibold">Not lost — just nurtured</h3>
                    {nurtureReason && (
                      <div className="fade-up mt-5"><BigBtn primary accent={accent} disabled={savingLost} onClick={addToNurture}>{savingLost ? "Adding…" : "Add to marketing funnel ✓"}</BigBtn></div>
                    )}
                  </div>
                  <div className="flex flex-col justify-center">
                    <p className="text-sm font-medium text-gray-800">First — why didn&apos;t it convert?</p>
                    <p className="mt-1 text-xs text-gray-400">We log the reason before nurturing so we learn what to fix.</p>
                    <div className="mt-4 space-y-2">
                      {lostReasons.map((reason) => {
                        const selected = nurtureReason === reason;
                        return (
                          <button key={reason} onClick={() => setNurtureReason(reason)} className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm font-medium transition ${selected ? "text-white" : "border-gray-200 text-gray-700 hover:border-gray-900 hover:bg-gray-50"}`} style={selected ? { backgroundColor: accent, borderColor: accent } : undefined}>
                            {reason}{selected && <span>✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
              {lostStep === "done" && (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="flex h-16 w-16 animate-[lost-slide_0.4s_ease] items-center justify-center rounded-full bg-green-100 text-3xl text-green-600">✓</div>
                  <p className="mt-4 text-center font-medium">Added to your mailing list</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// The guide this lead filled a form to get. Matched server-side against the
// brand's uploaded lead magnets (fuzzy — ad names and guide titles are never
// written identically), so the agent can pull up EXACTLY what the lead was
// promised and talk it through with them instead of hunting for the PDF.
// No match / no magnets uploaded yet -> renders nothing.
function MagnetRow({ lead, accent }: { lead: Lead; accent: string }) {
  const [magnet, setMagnet] = useState<{ id: string; title: string } | null>(null);
  // "none" = we looked, found no match, and the brand DOES have guides — the
  // case that gets the See-all fallback (James, 7 Aug). Distinct from the
  // initial state so nothing flashes while the fetch is in flight, and from
  // an empty library, where a browse page would just be an empty page.
  const [fallback, setFallback] = useState(false);
  useEffect(() => {
    const text = [lead.adName, lead.interestedIn, lead.note]
      .filter(Boolean)
      .join(" ");
    if (!text.trim()) return;
    fetch(
      `/api/magnets?match=${encodeURIComponent(text)}&ad=${encodeURIComponent(lead.adName ?? "")}`
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.match) setMagnet({ id: d.match.id, title: d.match.title });
        else if ((d?.magnets ?? []).length > 0) setFallback(true);
      })
      .catch(() => {});
  }, [lead.id, lead.adName, lead.interestedIn, lead.note]);

  if (magnet) {
    return (
      <div className="border-t border-gray-200 pt-3">
        <p className="text-xs font-medium text-gray-400">The guide they asked for</p>
        <a
          href={`/api/magnets/${magnet.id}`}
          download
          className="mt-1.5 flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-sm font-medium transition hover:bg-gray-50"
          style={{ borderColor: `${accent}55`, color: accent }}
        >
          <span className="min-w-0 truncate">📄 {magnet.title}</span>
          <span className="shrink-0 text-xs font-semibold uppercase tracking-wide">
            Download
          </span>
        </a>
      </div>
    );
  }
  if (fallback) {
    return (
      <div className="border-t border-gray-200 pt-3">
        <p className="text-xs font-medium text-gray-400">The guide they asked for</p>
        <Link
          href="/dashboard/guides"
          className="mt-1.5 flex items-center justify-between gap-3 rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
        >
          <span className="min-w-0 truncate">
            Couldn&apos;t tell which one — browse them all
          </span>
          <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-gray-500">
            See all guides →
          </span>
        </Link>
      </div>
    );
  }
  return null;
}

// ── Small building blocks ─────────────────────────────────────────────────
function QaRow({ q, a }: { q: string; a: string }) {
  return (
    <div className="border-t border-gray-200 pt-3 first:border-none first:pt-0">
      <p className="text-xs font-medium text-gray-400">{q}</p>
      <p className="mt-0.5 text-gray-800">{a}</p>
    </div>
  );
}

function StagePill({ lead, brand }: { lead: Lead; brand: Brand }) {
  if (lead.resurfaceAt) {
    return <span className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: "#fff7ed", color: "#c2410c" }}>🔥 Warm · back {shortDate(lead.resurfaceAt)}</span>;
  }
  return <span className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: brand.accentSoft, color: brand.accent }}>{stageLabel(lead.stage, brand)}</span>;
}

function Tool({ active, accent, onClick, icon, label }: { active: boolean; accent: string; onClick: () => void; icon: ReactNode; label: string }) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center gap-2 rounded-2xl border py-4 text-sm font-semibold transition ${active ? "text-white" : "border-gray-200 text-gray-700 hover:bg-gray-50"}`} style={active ? { backgroundColor: accent, borderColor: accent } : undefined}>
      {icon}{label}
    </button>
  );
}

function NextCard({ tone, accent, num, tick, title, body, hint, children }: { tone: "plain" | "accent" | "good"; accent?: string; num?: number; tick?: boolean; title: string; body?: string; hint?: string; children?: ReactNode }) {
  const style: React.CSSProperties =
    tone === "accent" ? { borderColor: `${accent}66`, backgroundColor: `${accent}0d` }
    : tone === "good" ? { borderColor: "#86efac", backgroundColor: "#f0fdf4" }
    : {};
  const badge = tone === "good" ? "#16a34a" : accent;
  return (
    <div className={`rounded-2xl border p-5 ${tone === "plain" ? "border-dashed border-gray-300 bg-gray-50" : ""}`} style={tone === "plain" ? undefined : style}>
      <div className="mb-2.5 flex items-center gap-2.5">
        <span className="flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-bold text-white" style={{ backgroundColor: badge }}>{tick ? "✓" : num ?? "→"}</span>
        <b className="text-[15px]">{title}</b>
      </div>
      {body && <p className="mb-3.5 text-[13.5px] text-gray-500">{body}</p>}
      {children}
      {hint && <p className="mt-2.5 text-center text-[12px] text-gray-400">{hint}</p>}
    </div>
  );
}

function FollowChip({ label, days, onPick, disabled }: { label: string; days: number; onPick: (d: Date) => void; disabled?: boolean }) {
  return (
    <button disabled={disabled} onClick={() => { const d = new Date(); d.setDate(d.getDate() + days); onPick(d); }} className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:border-gray-900 hover:bg-gray-50 disabled:opacity-50">
      {label}
    </button>
  );
}

// Inline-editable name in the header.
function InlineName({ value, onSave }: { value: string; onSave?: (v: string) => Promise<Lead | null | void> | void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);
  useEffect(() => setVal(value), [value]);
  async function commit() {
    setEditing(false);
    if (val.trim() && val.trim() !== value.trim()) await onSave?.(val.trim());
    else setVal(value);
  }
  if (editing) {
    return (
      <input autoFocus value={val} onChange={(e) => setVal(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} className="min-w-0 border-b border-gray-300 bg-transparent text-xl font-semibold outline-none focus:border-gray-900" />
    );
  }
  return (
    <button onClick={() => setEditing(true)} className="rounded text-left text-xl font-semibold hover:bg-gray-50" title="Click to edit">
      {value}
    </button>
  );
}

// Inline-editable text field (phone/email). Click to edit, blur/enter to save.
function InlineField({ label, icon, value, placeholder, type, onSave }: { label: string; icon: ReactNode; value: string; placeholder: string; type?: string; onSave?: (v: string) => Promise<Lead | null | void> | void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);
  const [saving, setSaving] = useState(false);
  useEffect(() => setVal(value), [value]);
  async function commit() {
    setEditing(false);
    if (val.trim() === value.trim()) return;
    setSaving(true);
    await onSave?.(val.trim());
    setSaving(false);
  }
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 transition focus-within:border-gray-900 hover:border-gray-300" onClick={() => !editing && setEditing(true)}>
      <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
        <span className="[&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span> {label}
      </p>
      {editing ? (
        <input autoFocus type={type} value={val} onChange={(e) => setVal(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} className="w-full bg-transparent text-[15px] font-medium text-gray-900 outline-none" />
      ) : (
        <p className={`truncate text-[15px] font-medium ${value ? "text-gray-900" : "text-gray-400"}`}>{saving ? "Saving…" : value || placeholder}</p>
      )}
    </div>
  );
}

// Address field: type an address, we pull the postcode and geocode it (free,
// via postcodes.io) so it can be pushed to the CRM. Google Places autocomplete
// slots in here once a Maps key is configured.
function AddressField({ lead, onSave }: { lead: Lead; onSave?: (fields: Partial<Lead>) => Promise<Lead | null | void> }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(lead.address ?? "");
  const [saving, setSaving] = useState(false);
  // Google Places suggestions under the input. The Places library was always
  // loaded by lib/google-maps but nothing USED it — typing an address gave no
  // recommendations at all (James, 7 Aug). Predictions are debounced and
  // UK-restricted; no key configured -> the list just never appears and the
  // field behaves as the plain text box it was.
  const [suggestions, setSuggestions] = useState<{ id: string; text: string }[]>([]);
  const acRef = useRef<{ svc: unknown; timer?: ReturnType<typeof setTimeout> }>({ svc: null });

  useEffect(() => setVal(lead.address ?? ""), [lead.address]);

  function predict(input: string) {
    const ac = acRef.current;
    if (ac.timer) clearTimeout(ac.timer);
    if (input.trim().length < 4) { setSuggestions([]); return; }
    ac.timer = setTimeout(async () => {
      try {
        const maps = await loadGoogleMaps();
        if (!maps) return;
        if (!ac.svc) ac.svc = new maps.places.AutocompleteService();
        (ac.svc as { getPlacePredictions: (r: unknown, cb: (res: unknown[] | null) => void) => void })
          .getPlacePredictions(
            { input, componentRestrictions: { country: "gb" } },
            (res) => {
              const list = ((res ?? []) as { place_id: string; description: string }[])
                .slice(0, 5)
                .map((r) => ({ id: r.place_id, text: r.description }));
              setSuggestions(list);
            }
          );
      } catch {
        /* no maps -> no suggestions; the field still works as free text */
      }
    }, 250);
  }

  /* A picked suggestion geocodes by place id — street-level coordinates and
     the real postcode, rather than the centre of a postcode district. */
  async function pick(sug: { id: string; text: string }) {
    setSuggestions([]);
    setVal(sug.text);
    setEditing(false);
    setSaving(true);
    let lat: number | null = null;
    let lng: number | null = null;
    let postcode: string | null = extractPostcode(sug.text);
    try {
      const maps = await loadGoogleMaps();
      if (maps) {
        const geo = new maps.Geocoder();
        const res: { results?: { geometry?: { location?: { lat(): number; lng(): number } }; address_components?: { types: string[]; long_name: string }[] }[] } =
          await geo.geocode({ placeId: sug.id });
        const first = res.results?.[0];
        const loc = first?.geometry?.location;
        if (loc) { lat = loc.lat(); lng = loc.lng(); }
        const pc = first?.address_components?.find((c) => c.types.includes("postal_code"))?.long_name;
        if (pc) postcode = pc;
      }
    } catch {
      /* fall back to the postcode-only path below */
    }
    if (lat == null && postcode) {
      const c = await geocodeUk(postcode);
      if (c) { lat = c.lat; lng = c.lng; }
    }
    await onSave?.({ address: sug.text || null, postcode, lat, lng });
    setSaving(false);
  }

  async function commit() {
    setEditing(false);
    setSuggestions([]);
    const address = val.trim();
    if (address === (lead.address ?? "").trim()) return;
    setSaving(true);
    const postcode = extractPostcode(address);
    let lat: number | null = null;
    let lng: number | null = null;
    if (postcode) {
      const c = await geocodeUk(postcode);
      if (c) { lat = c.lat; lng = c.lng; }
    }
    await onSave?.({ address: address || null, postcode, lat, lng });
    setSaving(false);
  }
  const tagged = lead.lat != null && lead.lng != null;
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 transition focus-within:border-gray-900 hover:border-gray-300 sm:col-span-2" onClick={() => !editing && setEditing(true)}>
      <p className="mb-1 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
        <span className="[&>svg]:h-3.5 [&>svg]:w-3.5"><PinIcon /></span> Location
        <span className="font-medium normal-case tracking-normal text-gray-400">— we&apos;ll geotag it for {brandCrm(lead)}</span>
        {tagged && <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">geotagged ✓</span>}
      </p>
      {editing ? (
        <>
          <input autoFocus value={val} onChange={(e) => { setVal(e.target.value); predict(e.target.value); }} onBlur={() => setTimeout(commit, 150)} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} placeholder="Start typing an address…" className="w-full bg-transparent text-[15px] font-medium text-gray-900 outline-none placeholder:text-gray-400" />
          {suggestions.length > 0 && (
            <div className="mt-2 overflow-hidden rounded-xl border border-gray-200 bg-white">
              {suggestions.map((sug) => (
                /* onMouseDown, not onClick — it fires BEFORE the input's blur,
                   so picking wins over the delayed free-text commit. */
                <button key={sug.id} onMouseDown={(e) => { e.preventDefault(); pick(sug); }} className="block w-full border-b border-gray-100 px-3 py-2.5 text-left text-sm text-gray-800 last:border-none hover:bg-gray-50">
                  {sug.text}
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className={`text-[15px] font-medium ${lead.address ? "text-gray-900" : "text-gray-400"}`}>
          {saving ? "Geotagging…" : lead.address || "Add an address…"}
          {lead.postcode && !saving && <span className="ml-2 text-xs font-normal text-gray-400">{lead.postcode}</span>}
        </p>
      )}
    </div>
  );
}
function brandCrm(_lead: Lead): string {
  return "the CRM";
}

// ── Icons ──
function PhoneIcon() {
  return (<svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M2.3 6.7c0 8.3 6.7 15 15 15h2.2a2.2 2.2 0 002.3-2.2v-1.4c0-.5-.4-1-.9-1.1l-4.4-1.1c-.4-.1-.9.1-1.2.4l-1 1.3c-.3.4-.8.5-1.2.4a12 12 0 01-7.1-7.2c-.2-.4 0-.9.4-1.2l1.3-1c.4-.3.5-.7.4-1.2L6.9 3.1a1.1 1.1 0 00-1-.9H4.5A2.2 2.2 0 002.3 4.5z" /></svg>);
}
function MailIcon() {
  return (<svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M3 7.2 12 13l9-5.8M4 5h16a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1z" /></svg>);
}
function CalIcon() {
  return (<svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M8 2v3M16 2v3M3.5 9h17M5 4.5h14A1.5 1.5 0 0120.5 6v13A1.5 1.5 0 0119 20.5H5A1.5 1.5 0 013.5 19V6A1.5 1.5 0 015 4.5z" /></svg>);
}
function WhatsAppIcon() {
  return (<svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor"><path d="M17.5 14.4c-.3-.15-1.8-.9-2.05-1-.28-.1-.48-.15-.68.15-.2.3-.78 1-.96 1.2-.18.2-.35.22-.65.08-.3-.15-1.27-.47-2.42-1.5-.9-.8-1.5-1.78-1.67-2.08-.18-.3-.02-.46.13-.6.14-.14.3-.36.45-.54.15-.18.2-.3.3-.5.1-.2.05-.38-.02-.53-.08-.15-.68-1.63-.93-2.23-.24-.58-.49-.5-.68-.51h-.58c-.2 0-.53.08-.8.38-.28.3-1.05 1.03-1.05 2.5s1.08 2.9 1.23 3.1c.15.2 2.12 3.24 5.14 4.54.72.31 1.28.5 1.71.63.72.23 1.38.2 1.9.12.58-.09 1.8-.74 2.05-1.45.25-.71.25-1.32.18-1.45-.07-.13-.27-.2-.57-.35zM12.05 21.5h-.02a9.4 9.4 0 01-4.8-1.32l-.34-.2-3.57.94.95-3.48-.22-.36a9.42 9.42 0 01-1.44-5.02c0-5.2 4.24-9.44 9.46-9.44a9.4 9.4 0 016.68 2.77 9.38 9.38 0 012.76 6.68c0 5.2-4.24 9.44-9.46 9.44zm8.04-17.5A11.36 11.36 0 0012.05.5C5.8.5.73 5.57.73 11.8c0 2 .52 3.95 1.52 5.67L.63 23.5l6.18-1.62a11.33 11.33 0 005.23 1.33h.01c6.24 0 11.32-5.07 11.32-11.3 0-3.02-1.18-5.86-3.28-8z" /></svg>);
}
function PinIcon() {
  return (<svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M12 21s-6.5-5.8-6.5-11a6.5 6.5 0 1113 0c0 5.2-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.3" /></svg>);
}

// ── Time picker ──
function TimePicker({ value, accent, onChange }: { value: string; accent: string; onChange: (t: string) => void }) {
  const START_HOUR = 7;
  const END_HOUR = 20;
  const [h, m] = value ? value.split(":").map(Number) : [9, 0];
  const hour = Number.isFinite(h) ? Math.min(END_HOUR, Math.max(START_HOUR, h)) : 9;
  const minute = [0, 15, 30, 45].includes(m) ? m : 0;
  const set = (nextH: number, nextM: number) => onChange(`${String(nextH).padStart(2, "0")}:${String(nextM).padStart(2, "0")}`);
  useEffect(() => { if (!value) set(hour, minute); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  const label = (() => { const suffix = hour < 12 ? "am" : "pm"; const h12 = hour % 12 === 0 ? 12 : hour % 12; return `${h12}:${String(minute).padStart(2, "0")} ${suffix}`; })();
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <label className="text-xs font-medium uppercase tracking-wide text-gray-400">Time</label>
        <span className="text-lg font-semibold" style={{ color: accent }}>{label}</span>
      </div>
      <input type="range" min={START_HOUR} max={END_HOUR} step={1} value={hour} onChange={(e) => set(Number(e.target.value), minute)} className="teg-time-slider w-full" style={{ accentColor: accent, color: accent }} />
      <div className="mt-1 flex justify-between text-[10px] text-gray-400"><span>{START_HOUR % 12 || 12}am</span><span>12pm</span><span>{END_HOUR % 12 || 12}pm</span></div>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {[0, 15, 30, 45].map((mm) => { const selected = mm === minute; return (
          <button key={mm} onClick={() => set(hour, mm)} className={`rounded-xl py-2.5 text-sm font-medium transition ${selected ? "text-white" : "border border-gray-200 text-gray-600 hover:bg-gray-50"}`} style={selected ? { backgroundColor: accent } : undefined}>:{String(mm).padStart(2, "0")}</button>
        ); })}
      </div>
    </div>
  );
}

// ── Inline calendar ──
function InlineCalendar({ value, accent, onPick, big }: { value: Date | null; accent: string; onPick: (d: Date) => void; big?: boolean }) {
  const [month, setMonth] = useState(() => { const d = value ?? new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const year = month.getFullYear();
  const mon = month.getMonth();
  const firstWeekday = (new Date(year, mon, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, mon + 1, 0).getDate();
  const cells: (number | null)[] = [...Array<null>(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const canPrev = new Date(year, mon, 1) > new Date(today.getFullYear(), today.getMonth(), 1);
  return (
    <div className={big ? "" : "rounded-xl border border-gray-200 bg-white p-3"}>
      <div className={`flex items-center justify-between px-1 ${big ? "pb-3" : "pb-2"}`}>
        <button disabled={!canPrev} onClick={() => setMonth(new Date(year, mon - 1, 1))} className={`rounded-lg px-2 text-gray-400 hover:bg-gray-100 disabled:opacity-30 ${big ? "py-1 text-xl" : "py-1"}`} aria-label="Previous month">‹</button>
        <span className={`font-semibold ${big ? "text-base" : "text-sm"}`}>{month.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</span>
        <button onClick={() => setMonth(new Date(year, mon + 1, 1))} className={`rounded-lg px-2 text-gray-400 hover:bg-gray-100 ${big ? "py-1 text-xl" : "py-1"}`} aria-label="Next month">›</button>
      </div>
      <div className={`grid grid-cols-7 text-center font-medium text-gray-400 ${big ? "text-xs" : "text-[11px]"}`}>{["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (<div key={i} className={big ? "py-1.5" : "py-1"}>{d}</div>))}</div>
      <div className={`grid grid-cols-7 ${big ? "gap-1.5" : "gap-1"}`}>
        {cells.map((day, i) => {
          if (day === null) return <div key={i} />;
          const date = new Date(year, mon, day);
          const past = date < today;
          const selected = value && value.getFullYear() === year && value.getMonth() === mon && value.getDate() === day;
          return (
            <button key={i} disabled={past} onClick={() => onPick(date)} className={`aspect-square rounded-xl transition ${big ? "text-[15px]" : "text-sm rounded-lg"} ${selected ? "font-semibold text-white" : past ? "text-gray-300" : "text-gray-700 hover:bg-gray-100"}`} style={selected ? { backgroundColor: accent } : undefined}>{day}</button>
          );
        })}
      </div>
    </div>
  );
}

// ── Sweeping expand/collapse ──
function Expand({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div className={`grid transition-all duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
      <div className="overflow-hidden">{children}</div>
    </div>
  );
}

function BigBtn({ children, onClick, primary, accent, disabled }: { children: ReactNode; onClick: () => void; primary?: boolean; accent?: string; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className={`w-full rounded-full py-3.5 text-sm font-semibold transition disabled:opacity-60 ${primary ? "text-white hover:opacity-90" : "border border-gray-200 text-gray-800 hover:bg-gray-50"}`} style={primary && accent ? { backgroundColor: accent } : undefined}>
      {children}
    </button>
  );
}
