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
//  • Clicked: opens the live assistant — a Claude-powered chat that answers
//    questions about the portal and "serves" how-to articles as tappable
//    cards. A Browse tab keeps the searchable article library (how-tos, our
//    calls, why-it-matters).
//  • Articles open in a pop-up over the panel (expandable to full screen);
//    closing it drops you back on the chat exactly where you were.
//  • The chat persists: the component lives in the dashboard layout so it
//    survives moving between tabs, and messages are mirrored to localStorage
//    so even a full reload picks the conversation back up.
// Themed with the brand accent via the --accent CSS variable set on the
// dashboard layout, so it recolours per brand automatically.

const TIPS_OFF_KEY = "teg-help-tips-off";
const CHAT_KEY = "teg-help-chat-v1";
const OPEN_KEY = "teg-help-open";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const WELCOME =
  "Hi! I'm your portal assistant. Ask me anything — how the lead funnel works, keeping a lead warm, booking appointments, referrals… I'll point you at the right how-to as we go.";

export default function HelpCentre() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"ask" | "browse">("ask");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ArticleKind | "all">("all");
  // The article pop-up sits OVER whatever view you're in, and can expand to
  // full screen — closing it never loses the chat underneath.
  const [active, setActive] = useState<HelpArticle | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

  // ── Chat state ──
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const restored = useRef(false);

  // Restore the conversation + open state once on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CHAT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ChatMessage[];
        if (Array.isArray(parsed)) setMessages(parsed);
      }
      if (localStorage.getItem(OPEN_KEY) === "1") setOpen(true);
    } catch {
      /* storage blocked — chat just starts fresh */
    }
    restored.current = true;
  }, []);

  // Mirror the conversation (and whether the panel is open) to storage.
  useEffect(() => {
    if (!restored.current) return;
    try {
      localStorage.setItem(CHAT_KEY, JSON.stringify(messages.slice(-40)));
    } catch {
      /* ignore */
    }
  }, [messages]);
  useEffect(() => {
    if (!restored.current) return;
    try {
      if (open) localStorage.setItem(OPEN_KEY, "1");
      else localStorage.removeItem(OPEN_KEY);
    } catch {
      /* ignore */
    }
  }, [open]);

  // Keep the chat pinned to the latest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, thinking, open, tab]);

  async function send(text?: string) {
    const q = (text ?? input).trim();
    if (!q || thinking) return;
    setInput("");
    setChatError(null);
    const next: ChatMessage[] = [...messages, { role: "user", content: q }];
    setMessages(next);
    setThinking(true);
    try {
      const res = await fetch("/api/help/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Something went wrong");
      }
      // Stream the reply straight into a growing assistant bubble.
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (!chunk) continue;
        setMessages((prev) => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          copy[copy.length - 1] = { ...last, content: last.content + chunk };
          return copy;
        });
      }
    } catch (e) {
      setChatError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setThinking(false);
    }
  }

  function clearChat() {
    setMessages([]);
    setChatError(null);
    try {
      localStorage.removeItem(CHAT_KEY);
    } catch {
      /* ignore */
    }
  }

  // ── Idle nudge state ──
  const [nudge, setNudge] = useState<Nudge | null>(null);
  const [tipsMuted, setTipsMuted] = useState(false);
  const nudgeIdx = useRef(0);

  useEffect(() => {
    try {
      setTipsMuted(localStorage.getItem(TIPS_OFF_KEY) === "1");
    } catch {
      /* storage blocked — tips just stay on */
    }
  }, []);

  // On mobile the floating launcher is hidden; the dashboard's three-dots menu
  // opens the panel by firing this event instead.
  useEffect(() => {
    const openFromMenu = () => {
      setNudge(null);
      setOpen(true);
    };
    window.addEventListener("teg:toggle-help", openFromMenu);
    return () => window.removeEventListener("teg:toggle-help", openFromMenu);
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
        gap = setTimeout(show, 45000);
      }, 12000);
    };
    const first = setTimeout(show, 9000);
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
  function openArticle(a: HelpArticle) {
    setActive(a);
    setFullscreen(false);
  }

  return (
    <>
      {/* ── Idle nudge bubble — pops out to the left of the button ── */}
      {nudge && !open && (
        <div className="fixed bottom-[92px] right-6 z-[70] hidden w-[300px] max-w-[calc(100vw-3rem)] animate-[fade-up_0.3s_ease] rounded-2xl border border-gray-200 bg-white p-4 shadow-2xl lg:block">
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
          <div className="fixed bottom-[92px] right-6 z-[80] flex h-[min(78vh,640px)] w-[380px] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl">
            {/* Header */}
            <div
              className="shrink-0 px-5 pb-3 pt-5 text-white"
              style={{ backgroundColor: "var(--accent, #111827)" }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Help Centre</h2>
                  <p className="mt-0.5 text-[13px] text-white/80">
                    Ask me anything, or browse the how-tos.
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
              {/* Tabs */}
              <div className="mt-3 flex gap-1 rounded-xl bg-white/15 p-1">
                {(
                  [
                    ["ask", "💬 Ask"],
                    ["browse", "📚 Browse"],
                  ] as const
                ).map(([t, label]) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition ${
                      tab === t ? "bg-white shadow" : "text-white/80 hover:text-white"
                    }`}
                    style={tab === t ? { color: "var(--accent, #111827)" } : undefined}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {tab === "ask" ? (
              /* ── The live assistant ── */
              <>
                <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                  <AssistantBubble content={WELCOME} onArticle={openArticle} />
                  {messages.length === 0 && (
                    <div className="flex flex-wrap gap-1.5 pl-1">
                      {[
                        "How does the lead funnel work?",
                        "How do I keep a lead warm?",
                        "How do referrals work?",
                      ].map((s) => (
                        <button
                          key={s}
                          onClick={() => send(s)}
                          className="rounded-full border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                  {messages.map((m, i) =>
                    m.role === "user" ? (
                      <div key={i} className="flex justify-end">
                        <div
                          className="max-w-[85%] rounded-2xl rounded-br-md px-3.5 py-2 text-sm text-white"
                          style={{ backgroundColor: "var(--accent, #111827)" }}
                        >
                          {m.content}
                        </div>
                      </div>
                    ) : (
                      <AssistantBubble key={i} content={m.content} onArticle={openArticle} />
                    )
                  )}
                  {thinking && messages[messages.length - 1]?.role === "user" && (
                    <div className="flex items-center gap-1.5 pl-1 text-gray-400">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:0ms]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:120ms]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:240ms]" />
                    </div>
                  )}
                  {chatError && (
                    <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">
                      {chatError}
                    </p>
                  )}
                </div>
                <div className="shrink-0 border-t border-gray-100 p-3">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      send();
                    }}
                    className="flex items-center gap-2"
                  >
                    <input
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="Ask about the portal…"
                      className="min-w-0 flex-1 rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-gray-400"
                    />
                    <button
                      type="submit"
                      disabled={!input.trim() || thinking}
                      aria-label="Send"
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white transition disabled:opacity-40"
                      style={{ backgroundColor: "var(--accent, #111827)" }}
                    >
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
                      </svg>
                    </button>
                  </form>
                  {messages.length > 0 && (
                    <button
                      onClick={clearChat}
                      className="mt-1.5 w-full text-center text-[11px] font-medium text-gray-300 transition hover:text-gray-500"
                    >
                      Start a fresh conversation
                    </button>
                  )}
                </div>
              </>
            ) : (
              /* ── Browse: the article library ── */
              <>
                <div className="shrink-0 border-b border-gray-100 px-4 pb-3 pt-3">
                  <div className="flex items-center gap-2 rounded-xl bg-gray-100 px-3 py-2">
                    <svg className="h-4 w-4 shrink-0 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <circle cx="11" cy="11" r="7" />
                      <path d="M21 21l-4.3-4.3" strokeLinecap="round" />
                    </svg>
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search help…"
                      className="w-full bg-transparent text-sm outline-none placeholder:text-gray-400"
                    />
                    {query && (
                      <button onClick={() => setQuery("")} aria-label="Clear search" className="text-gray-400 hover:text-gray-600">
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                        </svg>
                      </button>
                    )}
                  </div>
                  <div className="mt-2.5 flex gap-1.5 overflow-x-auto">
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
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-3">
                  {results.length === 0 ? (
                    <p className="px-3 py-10 text-center text-sm text-gray-400">
                      Nothing matches “{query}”. Try another word — or ask the assistant.
                    </p>
                  ) : (
                    <ul className="space-y-1.5">
                      {results.map((a) => (
                        <li key={a.id}>
                          <button
                            onClick={() => openArticle(a)}
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

      {/* ── Article pop-up — floats OVER the panel (or full screen) ── */}
      {open && active && (
        <>
          <button
            className="fixed inset-0 z-[85] cursor-default bg-black/20 backdrop-blur-[2px]"
            aria-hidden
            onClick={() => setActive(null)}
          />
          <div
            className={`fixed z-[90] flex flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl transition-all duration-300 ${
              fullscreen
                ? "inset-4 sm:inset-10"
                : "bottom-[132px] right-10 h-[min(64vh,520px)] w-[360px] max-w-[calc(100vw-4rem)]"
            }`}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                {KIND_LABEL[active.kind]}
                {active.minutes ? ` · ${active.minutes} min` : ""}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setFullscreen((f) => !f)}
                  aria-label={fullscreen ? "Shrink" : "Open full screen"}
                  className="rounded-full p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
                >
                  {fullscreen ? (
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 15H5m4 0v4m6-14v4m0 0h4M9 9H5m4 0V5m6 14v-4m0 0h4" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 9V4h5M20 15v5h-5M4 4l6 6m10 10l-6-6" />
                    </svg>
                  )}
                </button>
                <button
                  onClick={() => setActive(null)}
                  aria-label="Close article"
                  className="rounded-full p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <h3 className="text-lg font-semibold text-gray-900">{active.title}</h3>
              {active.kind === "call" && (
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
              <ArticleBody body={active.body} />
            </div>
          </div>
        </>
      )}

      {/* ── The launcher button ── */}
      <button
        onClick={() => (open ? setOpen(false) : openPanel())}
        aria-label={open ? "Close Help Centre" : "Open Help Centre"}
        className="fixed bottom-6 right-6 z-[80] hidden h-14 w-14 items-center justify-center rounded-full text-white shadow-lg transition hover:scale-105 lg:flex"
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

// ── Assistant bubble — renders text plus any [article:id] markers as cards ──
function AssistantBubble({
  content,
  onArticle,
}: {
  content: string;
  onArticle: (a: HelpArticle) => void;
}) {
  // Split the reply into text runs and article markers. Unknown ids are
  // dropped silently rather than shown as raw tokens.
  const parts = content.split(/\[article:([a-z0-9-]+)\]/g);
  return (
    <div className="max-w-[92%] space-y-2">
      {parts.map((part, i) => {
        if (i % 2 === 1) {
          const article = ARTICLES.find((a) => a.id === part);
          if (!article) return null;
          return (
            <button
              key={i}
              onClick={() => onArticle(article)}
              className="flex w-full items-center gap-2.5 rounded-2xl border border-gray-200 bg-white p-2.5 text-left shadow-sm transition hover:border-gray-300 hover:bg-gray-50"
            >
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-sm"
                style={{ backgroundColor: "var(--accent-soft, #f3f4f6)" }}
              >
                {article.kind === "call" ? "▶" : article.kind === "why" ? "💡" : "📄"}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-semibold text-gray-800">
                  {article.title}
                </span>
                <span className="block text-[11px] font-medium text-gray-400">
                  {KIND_LABEL[article.kind]}
                  {article.minutes ? ` · ${article.minutes} min read` : ""} — tap to open
                </span>
              </span>
            </button>
          );
        }
        const text = part.trim();
        if (!text) return null;
        return (
          <div
            key={i}
            className="whitespace-pre-wrap rounded-2xl rounded-bl-md bg-gray-100 px-3.5 py-2 text-sm leading-relaxed text-gray-800"
          >
            {text}
          </div>
        );
      })}
    </div>
  );
}

// Renders the plain-text article body: blank-line-separated blocks become
// paragraphs, and runs of "- " lines become a bullet list.
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
