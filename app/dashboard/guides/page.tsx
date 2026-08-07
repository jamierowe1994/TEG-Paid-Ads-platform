"use client";

// The guide library — deliberately UNLISTED. No nav item, no link anywhere
// except the "See all guides" fallback on a lead whose ad couldn't be
// matched to a guide (James, 7 Aug): when the automatic answer fails, the
// agent lands here and picks the right guide by eye. A backup, not a
// destination — if this page is getting real traffic, ad-to-guide pins are
// missing and the admin gap list is the fix.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Magnet {
  id: string;
  title: string;
  filename: string;
  size: number;
}

export default function GuidesPage() {
  const router = useRouter();
  const [magnets, setMagnets] = useState<Magnet[] | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    fetch("/api/magnets")
      .then((r) => {
        if (r.status === 401) {
          router.replace("/login?next=%2Fdashboard%2Fguides");
          return null;
        }
        return r.ok ? r.json() : null;
      })
      .then((d) => d && setMagnets(d.magnets ?? []))
      .catch(() => setMagnets([]));
  }, [router]);

  const visible = (magnets ?? []).filter(
    (m) =>
      !q.trim() ||
      `${m.title} ${m.filename}`.toLowerCase().includes(q.trim().toLowerCase())
  );
  const mb = (n: number) => `${(n / (1024 * 1024)).toFixed(1)} MB`;

  return (
    <div className="mx-auto max-w-2xl">
      <button
        onClick={() => router.back()}
        className="mb-4 text-sm font-medium text-gray-500 hover:text-gray-900"
      >
        ← Back to the lead
      </button>
      <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
        All guides
      </h1>
      <p className="mt-1 text-sm text-gray-500">
        Every guide your business offers. Find the one your lead asked for and
        download it.
      </p>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search guides…"
        className="mt-5 w-full rounded-xl border border-gray-200 px-4 py-2.5 text-[15px] outline-none transition focus:border-gray-900"
      />

      <div className="mt-4 space-y-2">
        {magnets === null && (
          <p className="py-6 text-sm text-gray-400">Loading…</p>
        )}
        {magnets !== null && visible.length === 0 && (
          <p className="py-6 text-sm text-gray-400">
            {q ? "Nothing matches that search." : "No guides uploaded yet."}
          </p>
        )}
        {visible.map((m) => (
          /* Plain <a>: agent downloads authenticate by session cookie. */
          <a
            key={m.id}
            href={`/api/magnets/${m.id}`}
            download
            className="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3.5 transition hover:border-gray-900"
          >
            <div className="min-w-0">
              <p className="truncate text-[15px] font-medium text-gray-900">
                📄 {m.title}
              </p>
              <p className="text-xs text-gray-400">{mb(m.size)}</p>
            </div>
            <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Download
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
