"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { BRANDS } from "@/lib/brands";
import { getPreviewAccent, getPreviewBrandId, setPreview } from "@/lib/preview";

// Floating feedback button (bottom-LEFT). This is an internal reviewer tool
// ("Send feedback" → /api/feedback, and "Preview brand colours"), so it's
// hidden from real customers — the customer-facing Help Centre owns the
// bottom-right corner now. It shows only in internal contexts: on /admin, when
// a brand-colour preview is active, or once someone opts in with ?internal=1
// (which sticks in localStorage). Visit any page with ?internal=1 to bring it
// back anywhere.

const INTERNAL_KEY = "teg_internal";

function useIsInternal(): boolean {
  const pathname = usePathname();
  const [internal, setInternal] = useState(false);
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("internal") === "1") {
        localStorage.setItem(INTERNAL_KEY, "1");
      }
      const flagged = localStorage.getItem(INTERNAL_KEY) === "1";
      const previewing = !!getPreviewBrandId() || !!getPreviewAccent();
      setInternal(pathname.startsWith("/admin") || flagged || previewing);
    } catch {
      setInternal(pathname.startsWith("/admin"));
    }
  }, [pathname]);
  return internal;
}

type Mode = "closed" | "drawing" | "note" | "sending" | "done";

export default function FeedbackWidget() {
  const internal = useIsInternal();
  const [mode, setMode] = useState<Mode>("closed");
  const [menuOpen, setMenuOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [accentInput, setAccentInput] = useState("#000000");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  // Seed the colour picker from any active preview accent (else brand default).
  useEffect(() => {
    if (!themeOpen) return;
    const pa = getPreviewAccent();
    if (pa) {
      setAccentInput(pa);
      return;
    }
    const id = getPreviewBrandId();
    const b = BRANDS.find((x) => x.id === id);
    if (b) setAccentInput(b.accent);
  }, [themeOpen]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  // Viewport size with a fallback, so the canvas backing store can never
  // collapse to 0 (which would make strokes invisible).
  function viewport() {
    return {
      w: window.innerWidth || document.documentElement.clientWidth || 1024,
      h: window.innerHeight || document.documentElement.clientHeight || 768,
    };
  }

  function sizeCanvas(canvas: HTMLCanvasElement) {
    const { w, h } = viewport();
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  // Size the annotation canvas's backing store to match the viewport. A
  // fresh <canvas> defaults to 300×150 internally regardless of its CSS size,
  // so without this the strokes land on a tiny buffer and scale off-screen.
  // We only resize when it doesn't already match (resizing clears the canvas),
  // so switching drawing → note → drawing keeps existing drawings intact.
  useEffect(() => {
    if (mode !== "drawing" && mode !== "note") return;
    const canvas = canvasRef.current;
    if (canvas) sizeCanvas(canvas);
  }, [mode]);

  function pointerPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function startDraw(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (canvas) {
      sizeCanvas(canvas);
      canvas.setPointerCapture?.(e.pointerId);
    }
    drawing.current = true;
    last.current = pointerPos(e);
    // Draw a dot immediately so a single tap/click registers.
    const ctx = canvas?.getContext("2d");
    if (ctx && last.current) {
      ctx.fillStyle = "#EF4444";
      ctx.beginPath();
      ctx.arc(last.current.x, last.current.y, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function moveDraw(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !last.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const pos = pointerPos(e);
    ctx.strokeStyle = "#EF4444";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    last.current = pos;
  }

  function endDraw() {
    drawing.current = false;
    last.current = null;
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
  }

  function reset() {
    clearCanvas();
    setNote("");
    setError("");
    setMode("closed");
  }

  async function submit() {
    if (!note.trim()) {
      setError("Add a quick note so we know what we're looking at.");
      return;
    }
    setMode("sending");
    setError("");

    let screenshot: string | null = null;
    try {
      // Screenshot the page, then stamp the annotation canvas on top.
      const html2canvas = (await import("html2canvas")).default;
      const shot = await html2canvas(document.body, {
        ignoreElements: (el) => el.id === "feedback-widget-root",
        logging: false,
        scale: Math.min(1, 1600 / window.innerWidth),
        width: window.innerWidth,
        height: window.innerHeight,
        x: window.scrollX,
        y: window.scrollY,
      });
      const merged = document.createElement("canvas");
      merged.width = shot.width;
      merged.height = shot.height;
      const ctx = merged.getContext("2d")!;
      ctx.drawImage(shot, 0, 0);
      if (canvasRef.current) {
        ctx.drawImage(canvasRef.current, 0, 0, merged.width, merged.height);
      }
      screenshot = merged.toDataURL("image/jpeg", 0.7);
    } catch {
      // Screenshot is best-effort — the note still goes through without it.
    }

    let email: string | null = null;
    try {
      const raw = window.localStorage.getItem("teg_user");
      email = raw ? (JSON.parse(raw).email ?? null) : null;
    } catch {
      /* not signed in */
    }

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          note: note.trim(),
          page: window.location.pathname,
          email,
          screenshot,
        }),
      });
      if (!res.ok) throw new Error();
      setMode("done");
      setTimeout(reset, 2500);
    } catch {
      setError("Couldn't send that — please try again.");
      setMode("note");
    }
  }

  // Internal reviewer tool only — hidden for real customers. (All hooks above
  // still run so the rules of hooks hold; we just render nothing.)
  if (!internal) return null;

  return (
    <div id="feedback-widget-root">
      {/* Drawing overlay */}
      {(mode === "drawing" || mode === "note") && (
        <canvas
          ref={canvasRef}
          className="fixed inset-0 z-[90] h-full w-full touch-none"
          style={{
            cursor: "crosshair",
            pointerEvents: mode === "drawing" ? "auto" : "none",
          }}
          onPointerDown={startDraw}
          onPointerMove={moveDraw}
          onPointerUp={endDraw}
          onPointerLeave={endDraw}
        />
      )}

      {/* Drawing toolbar */}
      {mode === "drawing" && (
        <div className="fixed left-1/2 top-6 z-[95] flex -translate-x-1/2 items-center gap-2 rounded-full bg-gray-900 px-4 py-2.5 text-sm text-white shadow-xl">
          <span className="mr-1 text-gray-300">
            Draw on the screen to circle anything
          </span>
          <button
            onClick={clearCanvas}
            className="rounded-full px-3 py-1 font-medium text-gray-300 hover:bg-white/10"
          >
            Clear
          </button>
          <button
            onClick={() => setMode("note")}
            className="rounded-full bg-white px-4 py-1 font-medium text-gray-900 hover:bg-gray-100"
          >
            Next
          </button>
          <button
            onClick={reset}
            className="rounded-full px-3 py-1 font-medium text-gray-300 hover:bg-white/10"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Note panel */}
      {(mode === "note" || mode === "sending") && (
        <div className="fixed bottom-6 right-6 z-[95] w-80 rounded-2xl border border-gray-200 bg-white p-5 shadow-2xl">
          <h3 className="font-semibold">Add your note</h3>
          <p className="mt-1 text-xs text-gray-400">
            We'll attach a screenshot of this page with your drawings.
          </p>
          <textarea
            autoFocus
            rows={4}
            className="mt-3 w-full resize-none rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-gray-900"
            placeholder="What should we change or fix?"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={mode === "sending"}
          />
          {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
          <div className="mt-3 flex justify-between">
            <button
              onClick={() => setMode("drawing")}
              className="rounded-lg px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50"
              disabled={mode === "sending"}
            >
              ← Back to drawing
            </button>
            <button
              onClick={submit}
              disabled={mode === "sending"}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
            >
              {mode === "sending" ? "Sending…" : "Send feedback"}
            </button>
          </div>
        </div>
      )}

      {/* Success toast */}
      {mode === "done" && (
        <div className="fixed bottom-6 right-6 z-[95] rounded-2xl bg-gray-900 px-5 py-4 text-sm font-medium text-white shadow-2xl">
          Thanks — feedback sent ✓
        </div>
      )}

      {/* Theme / colour preview panel (temporary tool) */}
      {themeOpen && (
        <div className="fixed bottom-6 right-6 z-[95] w-72 rounded-2xl border border-gray-200 bg-white p-4 shadow-2xl">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Preview brand colours</h3>
            <button
              onClick={() => setThemeOpen(false)}
              className="rounded p-1 text-gray-400 hover:bg-gray-100"
              aria-label="Close"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <p className="mt-1 text-xs text-gray-400">
            Temporary — see how the portal looks per brand.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {BRANDS.map((b) => (
              <button
                key={b.id}
                onClick={() => {
                  setPreview(b.id, null);
                  window.location.reload();
                }}
                className="flex items-center gap-2 rounded-lg border border-gray-200 p-2 text-left text-xs font-medium transition hover:border-gray-400"
              >
                <span
                  className="h-4 w-4 shrink-0 rounded-full ring-1 ring-black/10"
                  style={{ backgroundColor: b.accent }}
                />
                <span className="truncate">{b.shortName}</span>
              </button>
            ))}
          </div>
          <div className="mt-4">
            <label className="text-xs font-medium text-gray-500">
              Tweak the accent
            </label>
            <div className="mt-1.5 flex items-center gap-2">
              <input
                type="color"
                value={accentInput}
                onChange={(e) => setAccentInput(e.target.value)}
                className="h-9 w-9 cursor-pointer rounded border border-gray-200 bg-white"
              />
              <input
                type="text"
                value={accentInput}
                onChange={(e) => setAccentInput(e.target.value)}
                className="w-24 rounded-lg border border-gray-200 px-2 py-1.5 text-xs outline-none focus:border-gray-900"
              />
              <button
                onClick={() => {
                  setPreview(getPreviewBrandId(), accentInput);
                  window.location.reload();
                }}
                className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700"
              >
                Apply
              </button>
            </div>
          </div>
          <button
            onClick={() => {
              setPreview(null, null);
              window.location.reload();
            }}
            className="mt-4 w-full rounded-lg border border-gray-200 py-2 text-xs font-medium text-gray-500 hover:bg-gray-50"
          >
            Reset to my brand
          </button>
        </div>
      )}

      {/* Menu */}
      {menuOpen && mode === "closed" && !themeOpen && (
        <>
          <button
            className="fixed inset-0 z-[94] cursor-default"
            aria-hidden
            onClick={() => setMenuOpen(false)}
          />
          <div className="fixed bottom-20 left-6 z-[95] w-56 overflow-hidden rounded-2xl border border-gray-200 bg-white p-1.5 shadow-2xl">
            <button
              onClick={() => {
                setMenuOpen(false);
                setMode("drawing");
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium hover:bg-gray-50"
            >
              <span className="text-base">✏️</span> Send feedback
            </button>
            <button
              onClick={() => {
                setMenuOpen(false);
                setThemeOpen(true);
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium hover:bg-gray-50"
            >
              <span className="text-base">🎨</span> Preview brand colours
            </button>
          </div>
        </>
      )}

      {/* Floating button */}
      {mode === "closed" && !themeOpen && (
        <button
          onClick={() => setMenuOpen((v) => !v)}
          title="Internal: feedback & brand preview"
          className="fixed bottom-6 left-6 z-[95] flex h-12 w-12 items-center justify-center rounded-full bg-gray-900 text-white shadow-lg transition hover:scale-105 hover:bg-gray-700"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            viewBox="0 0 24 24"
          >
            <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
        </button>
      )}
    </div>
  );
}
