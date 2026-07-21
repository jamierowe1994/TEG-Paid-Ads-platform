"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  NUDGES,
  ARTICLES,
  KIND_LABEL,
  type HelpArticle,
  type ArticleKind,
  type Nudge,
} from "@/lib/help-content";

// Help Centre — the floating button in the bottom-right of the dashboard.
//  • Closed & idle: speed-to-lead "nudges" pop out of it now and then to push
//    the agent back to their leads (dismissible; can be muted).
//  • Clicked: opens a panel with searchable how-tos, our recorded calls, and
//    why-it-matters articles (content lives in lib/help-content.ts).
// Themed with the brand accent via the --accent CSS variable set on the
// dashboard layout, so it recolours per brand automatically.

const TIPS_OFF_KEY = "teg-help-tips-off";

export default function HelpCentre() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ArticleKind | "all">("all");
  const [active, setActive] = useState<HelpArticle | null>(null);

  // Idle nudge state.
  const [nudge, setNudge] = useState<Nudge | null>(null);
  const [tipsMuted, setTipsMuted] = useState(false);
  const nudgeIdx = useRef(0);

  // Remember whether the agent muted the tips.
  useEffect(() => {
    try {
      setTipsMuted(localStorage.getItem(TIPS_OFF_KEY) === "1");
    } catch {
      /* storage blocked — tips just stay on */
    }
  }, []);

  function muteTips() {
    setTipsMuted(true);
    setNudge(null);
    try {
      localStorage.setItem(TIPS_OFF_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  // The nudge cycle: after a short delay, pop a tip; hold it; hide it; wait;
  // repeat. Pauses entirely while the panel is open or tips are muted.
  useEffect(() => {
    if (open || tipsMuted) {
      setNudge(null);
      return;
    }
    let alive = true;
    let hold: ReturnType<typeof setTimeout>;
    let gap: ReturnType<typeof setTimeout>;
    const show = () => {
      if (!alive) return;
      setNudge(NUDGES[nudgeIdx.current % NUDGES.length]);
      nudgeIdx.current += 1;
      hold = setTimeout(() => {
        if (!alive) return;
        setNudge(null);
        gap = setTimeout(show, 45000); // breathing room between tips
      }, 12000); // how long each tip stays up
    };
    const first = setTimeout(show, 9000); // don't fire the instant the page loads
    return () => {
      alive = false;
      clearTimeout(first);
      clearTimeout(hold);
      clearTimeout(gap);
    };
  }, [open, tipsMuted]);

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    let list = ARTICLES;
    if (filter !== "all") list = list.filter((a) => a.kind === filter);
    if (q) {
      list = list.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.summary.toLowerCase().includes(q) ||
          a.body.toLowerCase().includes(q)
      );
    }
    return list;
  }, [q, filter]);

  function openPanel() {
    setNudge(null);
    setOpen(true);
  }

  return (
    <>
      {/* ── Idle nudge bubble — pops out to the left of the button ── */}
      {nudge && !open && (
        <div className="fixed bottom-[92px] right-6 z-[70] w-[300px] max-w-[calc(100vw-3rem)] animate-[fade-up_0.3s_ease] rounded-2xl border border-gray-200 bg-white p-4 shadow-2xl">
          <button
            onClick={() => setNudge(null)}
            aria-label="Dismiss tip"
            className="absolute right-2.5 top-2.5 rounded-full p-1 text-gray-300 transition hover:bg-gray-100 hover:text-gray-500"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
          <div className="flex gap-3">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-lg"
              style={{ backgroundColor: "var(--accent-soft, #f3f4f6)" }}
            >
              {nudge.icon}
            </span>
            <div className="pr-3">
              <p className="text-[13px] leading-snug text-gray-700">{nudge.text}</p>
              <div className="mt-2 flex items-center gap-3">
                <button
                  onClick={openPanel}
                  className="text-[11px] font-semibold"
                  style={{ color: "var(--accent, #111827)" }}
                >
                  Open Help Centre →
                </button>
                <button
                  onClick={muteTips}
                  className="text-[11px] font-medium text-gray-400 hover:text-gray-600"
                >
                  Mute tips
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── The panel ── */}
      {open && (
        <>
          <button
            className="fixed inset-0 z-[75] cursor-default"
            aria-hidden
            onClick={() => setOpen(false)}
          />
          <div className="fixed bottom-[92px] right-6 z-[80] flex max-h-[min(78vh,640px)] w-[380px] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl">
            {active ? (
              <ArticleView article={active} onBack={() => setActive(null)} onClose={() => setOpen(false)} />
            ) : (
              <>
                {/* Header */}
                <div
                  className="shrink-0 px-5 pb-4 pt-5 text-white"
                  style={{ backgroundColor: "var(--accent, #111827)" }}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-lg font-semibold">Help Centre</h2>
                      <p className="mt-0.5 text-[13px] text-white/80">
                        How-tos, our calls, and the odd nudge.
                      </p>
                    </div>
                    <button
                      onClick={() => setOpen(false)}
                      aria-label="Close"
                      className="rounded-full p-1 text-white/80 transition hover:bg-white/15 hover:text-white"
                    >
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
                      </svg>
                    </button>
                  </div>
                  {/* Search */}
                  <div className="mt-3 flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2 backdrop-blur">
                    <svg className="h-4 w-4 shrink-0 text-white/70" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <circle cx="11" cy="11" r="7" />
                      <path d="M21 21l-4.3-4.3" strokeLinecap="round" />
                    </svg>
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search help…"
                      className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/60"
                    />
                    {query && (
                      <button onClick={() => setQuery("")} aria-label="Clear search" className="text-white/70 hover:text-white">
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>

                {/* Filter chips */}
                <div className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-gray-100 px-4 py-3">
                  {(["all", "how", "why", "call"] as const).map((f) => {
                    const selected = filter === f;
                    return (
                      <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition ${
                          selected ? "text-white" : "border border-gray-200 text-gray-600 hover:bg-gray-50"
                        }`}
                        style={selected ? { backgroundColor: "var(--accent, #111827)" } : undefined}
                      >
                        {f === "all" ? "All" : KIND_LABEL[f]}
                      </button>
                    );
                  })}
                </div>

                {/* Article list */}
                <div className="min-h-0 flex-1 overflow-y-auto p-3">
                  {results.length === 0 ? (
                    <p className="px-3 py-10 text-center text-sm text-gray-400">
                      Nothing matches “{query}”. Try another word, or clear the search.
                    </p>
                  ) : (
                    <ul className="space-y-1.5">
                      {results.map((a) => (
                        <li key={a.id}>
                          <button
                            onClick={() => setActive(a)}
                            className="flex w-full items-start gap-3 rounded-2xl border border-gray-100 p-3 text-left transition hover:border-gray-200 hover:bg-gray-50"
                          >
                            <span
                              className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-sm"
                              style={{ backgroundColor: "var(--accent-soft, #f3f4f6)" }}
                            >
                              {a.kind === "call" ? "▶" : a.kind === "why" ? "💡" : "📄"}
                            </span>
                            <div className="min-w-0">
                              <p className="text-[13.5px] font-semibold text-gray-800">{a.title}</p>
                              <p className="mt-0.5 text-xs leading-snug text-gray-500">{a.summary}</p>
                              <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">
                                {KIND_LABEL[a.kind]}
                                {a.minutes ? ` · ${a.minutes} min` : ""}
                              </p>
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Footer — tips toggle */}
                <div className="shrink-0 border-t border-gray-100 px-4 py-2.5 text-center">
                  {tipsMuted ? (
                    <button
                      onClick={() => {
                        setTipsMuted(false);
                        try {
                          localStorage.removeItem(TIPS_OFF_KEY);
                        } catch {
                          /* ignore */
                        }
                      }}
                      className="text-[11px] font-medium text-gray-400 hover:text-gray-600"
                    >
                      Tips are off · turn them back on
                    </button>
                  ) : (
                    <button onClick={muteTips} className="text-[11px] font-medium text-gray-400 hover:text-gray-600">
                      Mute the pop-up tips
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* ── The launcher button ── */}
      <button
        onClick={() => (open ? setOpen(false) : openPanel())}
        aria-label={open ? "Close Help Centre" : "Open Help Centre"}
        className="fixed bottom-6 right-6 z-[80] flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg transition hover:scale-105"
        style={{ backgroundColor: "var(--accent, #111827)" }}
      >
        {open ? (
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M12 17.25h.008v.008H12v-.008z" />
            <circle cx="12" cy="12" r="9.25" />
          </svg>
        )}
      </button>
    </>
  );
}

// ── Article detail ──────────────────────────────────────────────────────────
function ArticleView({
  article,
  onBack,
  onClose,
}: {
  article: HelpArticle;
  onBack: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm font-medium text-gray-500 transition hover:text-gray-900"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          All articles
        </button>
        <button
          onClick={onClose}
          aria-label="Close"
          className="rounded-full p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
          {KIND_LABEL[article.kind]}
          {article.minutes ? ` · ${article.minutes} min` : ""}
        </p>
        <h3 className="mt-1 text-lg font-semibold text-gray-900">{article.title}</h3>

        {/* "Our calls" get a placeholder player above the notes */}
        {article.kind === "call" && (
          <div
            className="mt-3 flex aspect-video w-full items-center justify-center rounded-2xl"
            style={{ backgroundColor: "var(--accent-soft, #f3f4f6)" }}
          >
            <span
              className="flex h-12 w-12 items-center justify-center rounded-full text-white shadow"
              style={{ backgroundColor: "var(--accent, #111827)" }}
            >
              ▶
            </span>
          </div>
        )}

        <ArticleBody body={article.body} />
      </div>
    </>
  );
}

// Renders the plain-text body: blank-line-separated blocks become paragraphs,
// and runs of "- " lines become a bullet list.
function ArticleBody({ body }: { body: string }) {
  const blocks = body.split(/\n\n+/);
  return (
    <div className="mt-3 space-y-3 text-sm leading-relaxed text-gray-700">
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        const isList = lines.every((l) => l.trim().startsWith("- "));
        if (isList) {
          return (
            <ul key={i} className="space-y-1.5 pl-1">
              {lines.map((l, j) => (
                <li key={j} className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: "var(--accent, #9ca3af)" }} />
                  <span>{l.replace(/^\s*-\s+/, "")}</span>
                </li>
              ))}
            </ul>
          );
        }
        return <p key={i}>{block}</p>;
      })}
    </div>
  );
}
