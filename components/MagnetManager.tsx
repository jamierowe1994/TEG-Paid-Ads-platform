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
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [failures, setFailures] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
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

  /* Bulk-first: drop 30 PDFs on the zone and they go up ONE AT A TIME —
     one dropped connection costs that file, not the batch — with live
     "3 of 30" progress and a per-file failure list at the end. Titles come
     from the filenames (server cleans them: dashes to spaces, FINAL/v3
     stripped); the pencil on each row fixes any that don't match how the
     ads name the guide. */
  async function uploadFiles(list: FileList | File[]) {
    const files = Array.from(list);
    if (!files.length || busy) return;
    setBusy(true);
    setFailures([]);
    setNote("");
    const failed: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      setProgress(`Uploading ${i + 1} of ${files.length} — ${f.name}`);
      try {
        const form = new FormData();
        form.set("file", f);
        if (superPick) form.set("brandId", brand);
        const res = await fetch("/api/admin/magnets", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) failed.push(`${f.name}: ${d.error ?? `HTTP ${res.status}`}`);
      } catch {
        failed.push(`${f.name}: connection dropped — try it again`);
      }
      // Refresh as we go, so the library fills up live.
      if (i % 3 === 2 || i === files.length - 1) await load();
    }
    setProgress("");
    setFailures(failed);
    setNote(
      failed.length === 0
        ? `All ${files.length} uploaded ✓`
        : `${files.length - failed.length} of ${files.length} uploaded — ${failed.length} failed (listed below).`
    );
    if (fileRef.current) fileRef.current.value = "";
    setBusy(false);
  }

  async function saveRename(m: Magnet) {
    const title = renameVal.trim();
    setRenaming(null);
    if (!title || title === m.title) return;
    await fetch("/api/admin/magnets", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ id: m.id, title }),
    }).catch(() => {});
    load();
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

      {/* Upload — a drop zone, because "I've got like 30 of these". */}
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
      </div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          uploadFiles(e.dataTransfer.files);
        }}
        onClick={() => !busy && fileRef.current?.click()}
        className={`mt-3 cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition ${
          dragOver ? "border-gray-900 bg-gray-50" : "border-gray-300"
        } ${busy ? "pointer-events-none opacity-60" : ""}`}
      >
        <p className="text-sm font-medium text-gray-700">
          {busy ? progress : "Drop your PDFs here — as many as you like"}
        </p>
        <p className="mt-1 text-xs text-gray-400">
          {busy
            ? "Leave this tab open until it finishes."
            : "…or click to pick files. Titles come from the filenames; rename any after with the ✎."}
        </p>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="application/pdf,image/png,image/jpeg"
          className="hidden"
          onChange={(e) => e.target.files && uploadFiles(e.target.files)}
        />
      </div>
      {failures.length > 0 && (
        <div className="mt-3 space-y-1 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {failures.map((f) => (
            <p key={f}>{f}</p>
          ))}
        </div>
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
              {renaming === m.id ? (
                <input
                  autoFocus
                  value={renameVal}
                  onChange={(e) => setRenameVal(e.target.value)}
                  onBlur={() => saveRename(m)}
                  onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                  className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                />
              ) : (
                <p className="truncate text-sm font-medium text-gray-900">
                  {m.title}{" "}
                  <button
                    onClick={() => { setRenaming(m.id); setRenameVal(m.title); }}
                    title="Rename — the title is what leads get matched against"
                    className="text-gray-300 hover:text-gray-600"
                  >
                    ✎
                  </button>
                </p>
              )}
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
