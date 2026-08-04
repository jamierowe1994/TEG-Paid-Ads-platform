"use client";

// Live ads vs licences — the report behind "who has campaigns running and what
// are they actually on?".
//
// Exists because several agents turned up in Ads Manager who weren't on the Pro
// roster: some on Basic, some missing from Team Hub altogether. The status
// column matters as much as the licence one — a paused campaign for someone who
// left is not a problem, and without that distinction the list reads as far more
// alarming than it is.
//
// The name matching is a BEST GUESS, said plainly on screen. Campaigns are
// named by people, not by a schema. It's good enough to read and act on; it
// does not decide entitlement and nothing here writes anything.

import { useCallback, useEffect, useState } from "react";

interface Row {
  accountId: string;
  accountName: string;
  campaignId: string;
  campaignName: string;
  status: string;
  live: boolean;
  matchedName: string | null;
  matchedBrand: string | null;
  partnerPackage: string | null;
  flag: "no-team-hub-match" | "not-pro" | "no-package-set" | "ok";
}

const FLAG_COPY: Record<Row["flag"], { label: string; tone: string; why: string }> = {
  "no-team-hub-match": {
    label: "Not in Team Hub",
    tone: "bg-red-50 text-red-800",
    why: "No matching partner. If they're real, the Hub is missing them — and the Hub is the only thing deciding entitlement.",
  },
  "not-pro": {
    label: "Running ads, not on Pro",
    tone: "bg-amber-50 text-amber-900",
    why: "They already have ads but their licence says otherwise. On signup they'd be told to upgrade to get what they've got.",
  },
  "no-package-set": {
    label: "No licence recorded",
    tone: "bg-amber-50 text-amber-900",
    why: "Matched in the Hub but partner_package is empty, so they'd be treated as not entitled.",
  },
  ok: {
    label: "Pro",
    tone: "bg-green-50 text-green-800",
    why: "",
  },
};

export default function AdReconciliation({ pass }: { pass: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [meta, setMeta] = useState<{
    accountsSeen: number;
    accountsUnreadable: number;
    campaigns: number;
    live: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveOnly, setLiveOnly] = useState(true);
  const [ran, setRan] = useState(false);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/ad-reconciliation${liveOnly ? "?live=1" : ""}`,
        { headers: { Authorization: `Bearer ${pass}` }, cache: "no-store" }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Couldn't run the check.");
        setRows([]);
        return;
      }
      setRows(data.rows ?? []);
      setCounts(data.counts ?? {});
      setMeta({
        accountsSeen: data.accountsSeen,
        accountsUnreadable: data.accountsUnreadable,
        campaigns: data.campaigns,
        live: data.live,
      });
      setRan(true);
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setLoading(false);
    }
  }, [pass, liveOnly]);

  useEffect(() => {
    if (ran) run();
    // Re-run when the live filter changes, but don't fire on first mount —
    // this walks every ad account and shouldn't happen just by opening a tab.
  }, [liveOnly]); // eslint-disable-line react-hooks/exhaustive-deps

  const problems = rows.filter((r) => r.flag !== "ok");

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Live ads vs licences
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Walks every ad account this server can see and lines each campaign up
            against Team Hub. Use it to find agents running ads who aren&apos;t
            on Pro, or who aren&apos;t in the Hub at all.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={liveOnly}
              onChange={(e) => setLiveOnly(e.target.checked)}
            />
            Live campaigns only
          </label>
          <button
            onClick={run}
            disabled={loading}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {loading ? "Checking…" : ran ? "Re-run" : "Run check"}
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {meta && (
        <div className="mt-4 flex flex-wrap gap-4 text-sm text-gray-500">
          <span>
            <span className="font-semibold text-gray-900">
              {meta.accountsSeen}
            </span>{" "}
            ad accounts
          </span>
          <span>
            <span className="font-semibold text-gray-900">{meta.campaigns}</span>{" "}
            campaigns
          </span>
          <span>
            <span className="font-semibold text-gray-900">{meta.live}</span> live
          </span>
          <span>
            <span className="font-semibold text-gray-900">
              {problems.length}
            </span>{" "}
            need a look
          </span>
          {meta.accountsUnreadable > 0 && (
            <span className="text-amber-700">
              {meta.accountsUnreadable} account
              {meta.accountsUnreadable === 1 ? "" : "s"} unreadable — the System
              User may not have access
            </span>
          )}
        </div>
      )}

      {ran && (
        <p className="mt-4 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
          Names are matched from ad account and campaign titles, so this is a
          best guess — confirm by eye. Nothing here changes any account, and
          entitlement still comes only from the licence in Team Hub.
        </p>
      )}

      {ran && rows.length === 0 && !error && (
        <p className="mt-4 text-sm text-gray-500">
          No campaigns found{liveOnly ? " that are currently live" : ""}.
        </p>
      )}

      {rows.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-400">
                <th className="py-2 pr-3">Campaign</th>
                <th className="py-2 pr-3">Ad account</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Best-guess person</th>
                <th className="py-2 pr-3">Licence</th>
                <th className="py-2">Needs</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const f = FLAG_COPY[r.flag];
                return (
                  <tr
                    key={`${r.accountId}-${r.campaignId}`}
                    className="border-b border-gray-100 align-top"
                  >
                    <td className="py-2 pr-3 text-gray-900">{r.campaignName}</td>
                    <td className="py-2 pr-3 text-gray-500">{r.accountName}</td>
                    <td className="py-2 pr-3">
                      <span
                        className={
                          r.live
                            ? "font-medium text-green-700"
                            : "text-gray-400"
                        }
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-gray-700">
                      {r.matchedName ?? (
                        <span className="text-gray-400">no match</span>
                      )}
                      {r.matchedBrand && (
                        <span className="ml-1 text-xs text-gray-400">
                          ({r.matchedBrand})
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-gray-700">
                      {r.partnerPackage ?? (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="py-2">
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${f.tone}`}
                        title={f.why}
                      >
                        {f.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {ran && problems.length > 0 && (
        <div className="mt-4 space-y-1 text-xs text-gray-500">
          {Object.entries(counts)
            .filter(([k]) => k !== "ok")
            .map(([k, n]) => (
              <p key={k}>
                <span className="font-medium text-gray-700">
                  {FLAG_COPY[k as Row["flag"]]?.label ?? k} ({n})
                </span>{" "}
                — {FLAG_COPY[k as Row["flag"]]?.why}
              </p>
            ))}
        </div>
      )}
    </div>
  );
}
