"use client";

import { useEffect, useRef, useState } from "react";

// Floating feedback button (bottom-right, every page). Reviewers can draw
// on the screen to circle things, add a note, and submit — the annotated
// screenshot + note is POSTed to /api/feedback for the admin dashboard.

type Mode = "closed" | "drawing" | "note" | "sending" | "done";

export default function FeedbackWidget() {
  const [mode, setMode] = useState<Mode>("closed");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
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

      {/* Floating button */}
      {mode === "closed" && (
        <button
          onClick={() => setMode("drawing")}
          title="Send feedback"
          className="fixed bottom-6 right-6 z-[95] flex h-12 w-12 items-center justify-center rounded-full bg-gray-900 text-white shadow-lg transition hover:scale-105 hover:bg-gray-700"
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
