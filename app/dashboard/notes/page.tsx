"use client";

import { useEffect, useState } from "react";
import { getUser } from "@/lib/session";
import { brandById, type Brand } from "@/lib/brands";

// Shared review notes. Everyone signed in sees the same running list of
// feedback submitted via the on-page widget (the pencil, bottom-right), so
// the whole team can see what's been flagged and prepare changes.

interface Note {
  id: string;
  note: string;
  page: string;
  email: string | null;
  screenshot: string | null;
  createdAt: string;
}

export default function NotesPage() {
  const [brand, setBrand] = useState<Brand | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState<Note | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/feedback", { cache: "no-store" });
      if (res.ok) setNotes(await res.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const u = getUser();
    if (u) setBrand(brandById(u.brandId) ?? null);
    load();
  }, []);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Notes</h1>
          <p className="mt-2 text-gray-500">
            Everything flagged with the feedback button. Shared with the whole
            team.
          </p>
        </div>
        <button
          onClick={load}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-50"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <p className="mt-10 text-sm text-gray-400">Loading notes…</p>
      ) : notes.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-gray-200 py-16 text-center text-sm text-gray-400">
          No notes yet. Use the pencil button in the bottom-right of any page
          to circle something and leave a note — it'll show up here for
          everyone.
        </div>
      ) : (
        <div className="mt-8 space-y-4">
          {notes.map((n) => (
            <div
              key={n.id}
              className="flex items-start justify-between gap-4 rounded-2xl border border-gray-200 p-5"
            >
              <div className="min-w-0">
                <p className="text-sm text-gray-800">{n.note}</p>
                <p className="mt-2 text-xs text-gray-400">
                  {n.email ?? "Anonymous"} · {n.page || "/"} ·{" "}
                  {new Date(n.createdAt).toLocaleString("en-GB")}
                </p>
              </div>
              {n.screenshot && (
                <button
                  onClick={() => setZoom(n)}
                  className="shrink-0 overflow-hidden rounded-lg border border-gray-200 transition hover:ring-2 hover:ring-gray-300"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={n.screenshot}
                    alt="Annotated screenshot"
                    className="h-16 w-24 object-cover"
                  />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {zoom?.screenshot && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 p-8"
          onClick={() => setZoom(null)}
        >
          <div className="max-h-full max-w-4xl overflow-auto rounded-2xl bg-white p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={zoom.screenshot}
              alt="Annotated screenshot"
              className="rounded-lg"
            />
            <p className="mt-3 text-sm text-gray-700">{zoom.note}</p>
          </div>
        </div>
      )}
    </div>
  );
}
