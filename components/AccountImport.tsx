"use client";

import { useMemo, useRef, useState } from "react";
import { BRANDS, type Brand } from "@/lib/brands";

// One-time launch importer (super admin only): upload the staff list as a CSV,
// point each field at the right column, sanity-check the preview, confirm, and
// every row becomes a pre-provisioned referrals-only account. Everyone gets
// the shared launch password (TEG2026) and is forced to set their own the
// first time they sign in.
//
// Invite emails will go out via leads@theexpertsgroup.co.uk once that mailbox
// is wired up — until then, share the sign-in link + launch password manually.

const FIELDS = [
  { key: "firstName", label: "First name" },
  { key: "lastName", label: "Last name" },
  { key: "email", label: "Email" },
  { key: "mobile", label: "Mobile" },
  { key: "brand", label: "Brand" },
] as const;
type FieldKey = (typeof FIELDS)[number]["key"];

// Small quote-aware CSV parser — handles "quoted, cells" and "" escapes.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

// Turn whatever's in the brand column ("The Property Experts", "property",
// "Lettings") into a brand id, or null if we can't tell.
function matchBrand(value: string): Brand | null {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  for (const b of BRANDS) {
    if (
      v === b.id ||
      v === b.name.toLowerCase() ||
      v === b.shortName.toLowerCase() ||
      v.includes(b.shortName.toLowerCase()) ||
      b.name.toLowerCase().includes(v)
    ) {
      return b;
    }
  }
  return null;
}

// Guess which column belongs to which field from the header names.
function guessMapping(headers: string[]): Partial<Record<FieldKey, number>> {
  const guess: Partial<Record<FieldKey, number>> = {};
  headers.forEach((h, i) => {
    const n = h.trim().toLowerCase();
    if (guess.firstName === undefined && /first/.test(n)) guess.firstName = i;
    else if (guess.lastName === undefined && /(last|sur)/.test(n)) guess.lastName = i;
    else if (guess.email === undefined && /mail/.test(n)) guess.email = i;
    else if (guess.mobile === undefined && /(mobile|phone|tel)/.test(n)) guess.mobile = i;
    else if (guess.brand === undefined && /(brand|business|company)/.test(n)) guess.brand = i;
  });
  return guess;
}

export default function AccountImport({ pass }: { pass: string }) {
  const [open, setOpen] = useState(false);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Partial<Record<FieldKey, number>>>({});
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{
    created: number;
    skipped: { email: string; reason: string }[];
  } | null>(null);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  function loadFile(file: File | null) {
    if (!file) return;
    setResult(null);
    setError("");
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseCsv(String(reader.result ?? ""));
      if (parsed.length < 2) {
        setError("That file needs a header row plus at least one person.");
        return;
      }
      setHeaders(parsed[0]);
      setRows(parsed.slice(1));
      setMapping(guessMapping(parsed[0]));
    };
    reader.readAsText(file);
  }

  // Build the rows the API wants, and count what won't make it.
  const prepared = useMemo(() => {
    if (rows.length === 0) return null;
    const need: FieldKey[] = ["firstName", "lastName", "email", "brand"];
    if (need.some((k) => mapping[k] === undefined)) return null;
    const get = (r: string[], k: FieldKey) =>
      mapping[k] !== undefined ? (r[mapping[k]!] ?? "").trim() : "";
    const out = rows.map((r) => {
      const brand = matchBrand(get(r, "brand"));
      return {
        firstName: get(r, "firstName"),
        lastName: get(r, "lastName"),
        email: get(r, "email").toLowerCase(),
        mobile: get(r, "mobile"),
        brandId: brand?.id ?? "",
        brandLabel: brand?.shortName ?? get(r, "brand"),
        ok: !!brand && get(r, "email").includes("@") && !!get(r, "firstName"),
      };
    });
    return {
      rows: out,
      good: out.filter((r) => r.ok).length,
      bad: out.filter((r) => !r.ok).length,
    };
  }, [rows, mapping]);

  async function runImport() {
    if (!prepared || sending) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/admin/import-accounts", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${pass}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rows: prepared.rows
            .filter((r) => r.ok)
            .map(({ firstName, lastName, email, mobile, brandId }) => ({
              firstName,
              lastName,
              email,
              mobile,
              brandId,
            })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Import failed — nothing was created.");
        return;
      }
      setResult({ created: data.created, skipped: data.skipped ?? [] });
      setConfirming(false);
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="mt-10 rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold">
            Launch import — pre-make everyone&apos;s account
          </h2>
          <p className="mt-0.5 text-xs text-gray-500">
            One-time CSV import: creates a referrals-only account per person
            with the shared starter password <strong>TEG2026</strong>. Their
            first sign-in forces them to set their own. Invite emails switch on
            once the leads@ mailbox is connected.
          </p>
        </div>
        <button
          onClick={() => setOpen((o) => !o)}
          className="shrink-0 rounded-lg border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
        >
          {open ? "Close" : "Import accounts"}
        </button>
      </div>

      {open && (
        <div className="mt-4 border-t border-gray-100 pt-4">
          {/* Step 1 — pick the file */}
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => loadFile(e.target.files?.[0] ?? null)}
            className="block w-full text-xs text-gray-500 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-900 file:px-4 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-gray-700"
          />

          {/* Step 2 — map the columns */}
          {headers.length > 0 && (
            <>
              <div className="mt-4 grid gap-3 sm:grid-cols-5">
                {FIELDS.map((f) => (
                  <label key={f.key} className="block">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                      {f.label}
                      {f.key !== "mobile" && " *"}
                    </span>
                    <select
                      value={mapping[f.key] ?? ""}
                      onChange={(e) =>
                        setMapping((m) => ({
                          ...m,
                          [f.key]:
                            e.target.value === "" ? undefined : Number(e.target.value),
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-2 text-xs outline-none focus:border-gray-900"
                    >
                      <option value="">— pick column —</option>
                      {headers.map((h, i) => (
                        <option key={i} value={i}>
                          {h || `Column ${i + 1}`}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>

              {/* Step 3 — preview */}
              {prepared ? (
                <>
                  <div className="mt-4 overflow-x-auto rounded-xl border border-gray-100">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-400">
                        <tr>
                          <th className="px-3 py-2">Name</th>
                          <th className="px-3 py-2">Email</th>
                          <th className="px-3 py-2">Mobile</th>
                          <th className="px-3 py-2">Brand</th>
                          <th className="px-3 py-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {prepared.rows.slice(0, 8).map((r, i) => (
                          <tr key={i} className="border-t border-gray-50">
                            <td className="px-3 py-2">{r.firstName} {r.lastName}</td>
                            <td className="px-3 py-2">{r.email}</td>
                            <td className="px-3 py-2">{r.mobile || "—"}</td>
                            <td className="px-3 py-2">{r.brandLabel}</td>
                            <td className="px-3 py-2">
                              {r.ok ? (
                                <span className="font-semibold text-green-600">✓</span>
                              ) : (
                                <span className="font-semibold text-red-500" title="Missing email/name or unrecognised brand">✕</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {prepared.rows.length > 8 && (
                      <p className="border-t border-gray-50 px-3 py-2 text-[11px] text-gray-400">
                        …and {prepared.rows.length - 8} more rows
                      </p>
                    )}
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-4">
                    <p className="text-xs text-gray-500">
                      <strong className="text-gray-800">{prepared.good}</strong> ready to
                      create{prepared.bad > 0 && (
                        <> · <strong className="text-red-500">{prepared.bad}</strong> will be
                        skipped (fix the file or the mapping)</>
                      )}
                    </p>
                    {!confirming ? (
                      <button
                        onClick={() => setConfirming(true)}
                        disabled={prepared.good === 0}
                        className="rounded-lg bg-gray-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-gray-700 disabled:opacity-40"
                      >
                        Create {prepared.good} account{prepared.good === 1 ? "" : "s"}…
                      </button>
                    ) : (
                      <span className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-600">
                          Are you sure? This creates {prepared.good} live account
                          {prepared.good === 1 ? "" : "s"}.
                        </span>
                        <button
                          onClick={runImport}
                          disabled={sending}
                          className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-red-500 disabled:opacity-50"
                        >
                          {sending ? "Creating…" : "Yes — create them"}
                        </button>
                        <button
                          onClick={() => setConfirming(false)}
                          className="text-xs font-medium text-gray-400 hover:text-gray-600"
                        >
                          Cancel
                        </button>
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <p className="mt-3 text-xs text-amber-600">
                  Map the starred fields (first name, last name, email, brand) to
                  columns to see the preview.
                </p>
              )}
            </>
          )}

          {error && <p className="mt-3 text-xs text-red-500">{error}</p>}

          {/* Step 4 — results */}
          {result && (
            <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4">
              <p className="text-sm font-semibold text-green-800">
                {result.created} account{result.created === 1 ? "" : "s"} created ✓
              </p>
              <p className="mt-1 text-xs text-green-700">
                They&apos;re referrals-only, password <strong>TEG2026</strong>, and each
                person must set their own password when they first sign in at
                launchpad.theexpertsgroup.co.uk/login.
              </p>
              {result.skipped.length > 0 && (
                <details className="mt-2 text-xs text-green-800">
                  <summary className="cursor-pointer font-medium">
                    {result.skipped.length} skipped
                  </summary>
                  <ul className="mt-1 space-y-0.5">
                    {result.skipped.map((s, i) => (
                      <li key={i}>
                        {s.email} — {s.reason}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
