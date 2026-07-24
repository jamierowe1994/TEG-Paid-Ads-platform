"use client";

import { useRef, useState } from "react";
import type { Lead } from "@/lib/types";
import type { Brand } from "@/lib/brands";
import SourceIcon from "@/components/SourceIcon";

// "Tinder for leads" — the Uncontacted stack on mobile. The top card can be
// dragged: swipe RIGHT to open the full lead file, swipe LEFT to resurface it
// tomorrow. Up to two more cards peek behind it (the nearest clear, the next a
// faint edge). Each swipe advances the stack; when it empties, the parent
// shows "All caught up".
//
// onOpen — swipe right: open the lead modal (the card snaps back underneath it).
// onResurface — swipe left: snooze until tomorrow; the card flies off and the
// next one straightens up.

const SWIPE_THRESHOLD = 100;

function whatFor(lead: Lead): string {
  return lead.interestedIn?.trim() || lead.note?.trim() || "Enquiry";
}

export default function LeadSwipeStack({
  leads,
  brand,
  onOpen,
  onResurface,
}: {
  leads: Lead[];
  brand: Brand;
  onOpen: (lead: Lead) => void;
  onResurface: (lead: Lead) => void;
}) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [drag, setDrag] = useState(0);
  const [flying, setFlying] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const horiz = useRef(false);

  const visible = leads.filter((l) => !dismissed.has(l.id));
  const top = visible[0];
  const behind = visible.slice(1, 3); // up to two peeking behind

  function onDown(e: React.PointerEvent) {
    if (flying) return;
    start.current = { x: e.clientX, y: e.clientY };
    horiz.current = false;
  }
  function onMove(e: React.PointerEvent) {
    if (!start.current || flying) return;
    const dx = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;
    if (!horiz.current) {
      // Only capture once the gesture is clearly horizontal, so vertical
      // scrolling of the page still works when starting on the card.
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
        horiz.current = true;
        (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      } else if (Math.abs(dy) > 10) {
        start.current = null;
        return;
      }
    }
    if (horiz.current) setDrag(dx);
  }
  function onUp() {
    if (!start.current) {
      setDrag(0);
      return;
    }
    start.current = null;
    if (!horiz.current) {
      setDrag(0);
      return;
    }
    if (drag > SWIPE_THRESHOLD) {
      // Open the file — snap back; the modal opens over the stack.
      onOpen(top);
      setDrag(0);
    } else if (drag < -SWIPE_THRESHOLD) {
      // Resurface later — fling the card off, then advance.
      setFlying(true);
      setDrag(-window.innerWidth);
      window.setTimeout(() => {
        setDismissed((s) => new Set(s).add(top.id));
        setDrag(0);
        setFlying(false);
        onResurface(top);
      }, 260);
    } else {
      setDrag(0);
    }
  }

  if (!top) return null; // parent renders the "All caught up" state

  const rot = Math.max(-12, Math.min(12, drag * 0.05));
  const rightHint = Math.min(1, Math.max(0, drag / SWIPE_THRESHOLD));
  const leftHint = Math.min(1, Math.max(0, -drag / SWIPE_THRESHOLD));

  return (
    <div className="relative select-none" style={{ height: 344 }}>
      {/* Peeking cards behind — render farthest first so the nearer sits on top */}
      {behind
        .map((l, i) => ({ l, depth: i + 1 }))
        .reverse()
        .map(({ l, depth }) => (
          <div
            key={l.id}
            aria-hidden
            className="absolute inset-x-0 top-0 rounded-[26px] border border-white/60 bg-white shadow-[0_6px_24px_-10px_rgba(0,0,0,0.25)]"
            style={{
              height: 344,
              transform: `translateY(-${depth * 12}px) scale(${1 - depth * 0.05})`,
              opacity: depth === 1 ? 1 : 0.5,
              zIndex: 10 - depth,
            }}
          />
        ))}

      {/* Top card — draggable */}
      <div
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        className="absolute inset-x-0 top-0 cursor-grab touch-pan-y overflow-hidden rounded-[26px] border border-white/60 bg-white shadow-[0_12px_34px_-12px_rgba(0,0,0,0.32)] active:cursor-grabbing"
        style={{
          height: 344,
          zIndex: 20,
          transform: `translateX(${drag}px) rotate(${rot}deg)`,
          transition: start.current ? "none" : "transform 0.28s cubic-bezier(0.22,1,0.36,1)",
        }}
      >
        {/* Action hints — fade in as you drag */}
        <div
          className="pointer-events-none absolute left-4 top-4 z-10 rounded-full bg-green-500 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white shadow"
          style={{ opacity: rightHint, transform: `scale(${0.8 + rightHint * 0.2})` }}
        >
          Open file →
        </div>
        <div
          className="pointer-events-none absolute right-4 top-4 z-10 rounded-full bg-amber-500 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white shadow"
          style={{ opacity: leftHint, transform: `scale(${0.8 + leftHint * 0.2})` }}
        >
          ← Resurface later
        </div>

        <div className="flex h-full flex-col p-5">
          <div className="flex items-center gap-2 text-gray-400">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-xl"
              style={{ backgroundColor: brand.accentSoft }}
            >
              <SourceIcon source={top.source} size={18} />
            </span>
            <span className="text-[13px] font-medium capitalize">via {top.source}</span>
            <span
              className="ml-auto rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white"
              style={{ backgroundColor: brand.accent }}
            >
              New
            </span>
          </div>

          <div className="mt-auto">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              They&apos;re asking about
            </p>
            <p className="mt-1 text-lg font-medium leading-snug text-gray-800">
              {whatFor(top)}
            </p>
            <h3 className="mt-4 text-[28px] font-semibold leading-tight tracking-tight text-gray-900">
              {top.name}
            </h3>
            {top.phone && (
              <p className="mt-1 text-sm text-gray-500">{top.phone}</p>
            )}
          </div>

          <div className="mt-4 flex items-center justify-between text-[11px] font-medium text-gray-400">
            <span>← Resurface later</span>
            <span>Open file →</span>
          </div>
        </div>
      </div>
    </div>
  );
}
