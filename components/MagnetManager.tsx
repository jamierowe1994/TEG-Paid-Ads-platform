"use client";

// Upload and manage lead magnets — the guides leads fill a form to get.
//
// Built for the person who MAKES them (Francesca for TLE): she uploads her
// own assets rather than routing every PDF through James. Super admins see
// every brand with a picker; brand-scoped tiers (marketing, MD) are locked
// to their own — enforced server-side, the picker just hides.
//
// The title matters more than it looks: it's what leads' ad names are fuzzy-
// matched against to offer agents "the guide they asked for" — so name it
// the way the guide is named in the ads, not the way the file is named.

import { useCallback, useEffect, useRef, useState } from "react";
import { BRANDS } from "@/lib/brands";

interface Magnet {
  id: string;
  brandId: string;
  title: string;
  filename: string;
  size: number;
  createdAt: string;
  uploadedBy: string | null;
}

export default function MagnetManager({
  token,
  brandId,
  superPick = false,
}: {
  token: string;
  /** Fixed brand for scoped tiers; ignored when superPick. */
  brandId?: string | null;
  /** Super admin: show the brand picker. */
  superPick?: boolean;
}) {
  const [magnets, setMagnets] = useState<Magnet[]>([]);
  const [brand, setBrand] = useState(brandId ?? "lettings");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const q = superPick ? `?brand=${encodeURIComponent(brand)}` : "";
      const res = await fetch(`/api/admin/magnets${q}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const d = await res.json();
      if (res.ok) setMagnets(d.magnets ?? []);
    } catch {
      /* refresh button retries */
    }
  }, [token, brand, superPick]);

  useEffect(() => {
    load();
  }, [load]);

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file || !title.trim() || busy) return;
    setBusy(true);
    setError("");
    setNote("");
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("title", title.trim());
      if (superPick) form.set("brandId", brand);
      const res = await fetch("/api/admin/magnets", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? "Upload failed.");
      } else {
        setNote(`"${title.trim()}" uploaded ✓`);
        setTitle("");
        if (fileRef.current) fileRef.current.value = "";
        load();
      }
    } catch {
      setError("Couldn't reach the server.");
    }
    setBusy(false);
  }

  async function remove(m: Magnet) {
    if (!confirm(`Delete "${m.title}"? Agents will lose the download.`)) return;
    await fetch("/api/admin/magnets", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ id: m.id }),
    }).catch(() => {});
    load();
  }

  /* An <a href> carries no Authorization header, and admin tiers auth by
     bearer, not cookie — so the download fetches with the header and hands
     the bytes over as a blob. */
  async function download(m: Magnet) {
    try {
      const res = await fetch(`/api/magnets/${m.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = m.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      /* nothing downloaded — the button can be pressed again */
    }
  }

  const mb = (n: number) => `${(n / (1024 * 1024)).toFixed(1)} MB`;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Lead magnets</h2>
          <p className="mt-1 max-w-xl text-sm text-gray-500">
            The guides people fill a form to get. Agents see a download button
            on each lead for the guide it asked for — matched on the{" "}
            <span className="font-medium">title</span>, so name it the way the
            ads name it.
          </p>
        </div>
        <button
          onClick={load}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
        >
          Refresh
        </button>
      </div>

      {/* Upload */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {superPick && (
          <select
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
          >
            {BRANDS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Guide title, as the ads name it"
          className="min-w-[240px] flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
        />
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,image/png,image/jpeg"
          className="text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:text-sm file:font-medium"
        />
        <button
          onClick={upload}
          disabled={busy}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {busy ? "Uploading…" : "Upload"}
        </button>
      </div>
      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      {note && (
        <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{note}</p>
      )}

      {/* The library */}
      <div className="mt-4 divide-y divide-gray-100">
        {magnets.length === 0 && (
          <p className="py-3 text-sm text-gray-400">
            Nothing uploaded yet — the first guide makes the download buttons
            start appearing on leads.
          </p>
        )}
        {magnets.map((m) => (
          <div key={m.id} className="flex flex-wrap items-center gap-3 py-3">
            <span className="text-lg">📄</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-900">{m.title}</p>
              <p className="text-xs text-gray-400">
                {m.filename} · {mb(m.size)}
                {m.uploadedBy ? ` · by ${m.uploadedBy}` : ""}
              </p>
            </div>
            <button
              onClick={() => download(m)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
            >
              Download
            </button>
            <button
              onClick={() => remove(m)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-500 hover:border-red-300 hover:text-red-600"
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
