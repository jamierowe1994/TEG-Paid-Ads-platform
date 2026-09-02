"use client";

/* People — everyone currently on the platform, and whether they're using it.
 *
 * Replaces the Activity tab (a long feed of lead events, most of them nobody
 * needed to act on) and the CRM table (a signup list wearing a CRM's clothes).
 * The question this answers is the one that kept coming up: "is so-and-so
 * actually using it?" — last sign-in, whether they've installed the app,
 * what they're on, and what their leads have turned into.
 *
 * Nothing here writes. It's a view over the accounts that exist.
 */

import { useMemo, useState } from "react";
import { BRANDS, brandById } from "@/lib/brands";
import { packageById } from "@/lib/packages";
import type { UserProfile } from "@/lib/types";

export interface LeadSummary {
  userId: string;
  total: number;
  converted: number;
  speedMs: number | null;
  speedSamples: number;
}

type Usage = "regular" | "occasional" | "dormant" | "never";

const USAGE_LABEL: Record<Usage, string> = {
  regular: "Regular",
  occasional: "Occasional",
  dormant: "Gone quiet",
  never: "Never signed in",
};
const USAGE_STYLE: Record<Usage, string> = {
  regular: "bg-emerald-50 text-emerald-700",
  occasional: "bg-blue-50 text-blue-700",
  dormant: "bg-amber-50 text-amber-700",
  never: "bg-gray-100 text-gray-500",
};

const DAY = 24 * 60 * 60 * 1000;

function usageOf(u: UserProfile): Usage {
  if (!u.lastSeenAt) return "never";
  const age = Date.now() - new Date(u.lastSeenAt).getTime();
  if (age < 7 * DAY) return "regular";
  if (age < 30 * DAY) return "occasional";
  return "dormant";
}

function ago(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 2) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} day${d === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function payLabel(u: UserProfile): { text: string; cls: string } {
  if (u.accountType === "referral") return { text: "Referrals only", cls: "bg-gray-100 text-gray-600" };
  const pkg = packageById(u.packageId)?.name ?? "—";
  if (u.paymentState === "paid") return { text: `${pkg} · paid`, cls: "bg-emerald-50 text-emerald-700" };
  if (u.paymentState === "licence") return { text: `${pkg} · licence`, cls: "bg-gray-100 text-gray-600" };
  if (u.paymentState === "unpaid") return { text: `${pkg} · not paid`, cls: "bg-red-50 text-red-700" };
  return { text: pkg, cls: "bg-gray-100 text-gray-600" };
}

export default function PeopleBoard({
  users,
  summaries,
  onOpen,
}: {
  users: UserProfile[];
  summaries: LeadSummary[];
  onOpen: (u: UserProfile) => void;
}) {
  const [search, setSearch] = useState("");
  const [brand, setBrand] = useState("all");
  const [usage, setUsage] = useState<"all" | Usage>("all");
  const [sort, setSort] = useState<"seen" | "leads" | "name" | "joined">("seen");
  const [showLeft, setShowLeft] = useState(false);

  const byUser = useMemo(() => new Map(summaries.map((s) => [s.userId, s])), [summaries]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = users.filter((u) => {
      if (!showLeft && u.deactivatedAt) return false;
      if (brand !== "all" && u.brandId !== brand) return false;
      if (usage !== "all" && usageOf(u) !== usage) return false;
      if (q) {
        const hay = `${u.name} ${u.email} ${u.location ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const leadsOf = (u: UserProfile) => byUser.get(u.id)?.total ?? 0;
    list.sort((a, b) => {
      switch (sort) {
        case "seen":
          return (b.lastSeenAt ?? "").localeCompare(a.lastSeenAt ?? "");
        case "leads":
          return leadsOf(b) - leadsOf(a);
        case "name":
          return a.name.localeCompare(b.name);
        case "joined":
          return b.createdAt.localeCompare(a.createdAt);
      }
    });
    return list;
  }, [users, search, brand, usage, sort, showLeft, byUser]);

  // Headline counts respect the brand filter but not the usage filter, so
  // the four tiles always show the whole picture for the business chosen.
  const pool = users.filter(
    (u) => !u.deactivatedAt && (brand === "all" || u.brandId === brand)
  );
  const counts = {
    regular: pool.filter((u) => usageOf(u) === "regular").length,
    occasional: pool.filter((u) => usageOf(u) === "occasional").length,
    dormant: pool.filter((u) => usageOf(u) === "dormant").length,
    never: pool.filter((u) => usageOf(u) === "never").length,
    app: pool.filter((u) => u.appSeenAt).length,
  };

  const tile = (label: string, value: number, key: "all" | Usage, note?: string) => (
    <button
      onClick={() => setUsage(key)}
      className={`rounded-2xl p-5 text-left transition ${
        usage === key ? "bg-gray-900 text-white" : "bg-gray-50 hover:bg-gray-100"
      }`}
    >
      <p className={`text-xs uppercase tracking-wide ${usage === key ? "text-gray-300" : "text-gray-400"}`}>
        {label}
      </p>
      <p className="mt-1.5 text-2xl font-semibold tracking-tight">{value}</p>
      {note && (
        <p className={`mt-1 text-xs ${usage === key ? "text-gray-300" : "text-gray-400"}`}>{note}</p>
      )}
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {tile("Everyone", pool.length, "all", `${counts.app} have the app`)}
        {tile("Regular", counts.regular, "regular", "Signed in this week")}
        {tile("Occasional", counts.occasional, "occasional", "In the last month")}
        {tile("Gone quiet", counts.dormant, "dormant", "Not seen for a month")}
        {tile("Never signed in", counts.never, "never", "Account exists, unused")}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, email, area…"
          className="min-w-[200px] flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-900 sm:flex-none"
        />
        <select
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 outline-none focus:border-gray-900"
        >
          <option value="all">All businesses</option>
          {BRANDS.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 outline-none focus:border-gray-900"
        >
          <option value="seen">Most recently seen</option>
          <option value="leads">Most leads</option>
          <option value="joined">Newest</option>
          <option value="name">A to Z</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-500">
          <input
            type="checkbox"
            checked={showLeft}
            onChange={(e) => setShowLeft(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300"
          />
          Include people who&rsquo;ve left
        </label>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400 [&_th]:whitespace-nowrap">
            <tr>
              <th className="px-5 py-3 font-medium">Person</th>
              <th className="px-5 py-3 font-medium">Package</th>
              <th className="px-5 py-3 font-medium">Last signed in</th>
              <th className="px-5 py-3 font-medium">Uses it</th>
              <th className="px-5 py-3 font-medium">Where</th>
              <th className="px-5 py-3 text-right font-medium">Leads</th>
              <th className="px-5 py-3 text-right font-medium">Converted</th>
              <th className="px-5 py-3 font-medium">Email</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map((u) => {
              const b = brandById(u.brandId);
              const s = byUser.get(u.id);
              const use = usageOf(u);
              const pay = payLabel(u);
              const online =
                u.lastSeenAt && Date.now() - new Date(u.lastSeenAt).getTime() < 5 * 60 * 1000;
              return (
                <tr
                  key={u.id}
                  onClick={() => onOpen(u)}
                  className={`cursor-pointer transition hover:bg-gray-50 ${u.deactivatedAt ? "opacity-50" : ""}`}
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      {u.photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={u.photo} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                      ) : (
                        <span
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                          style={{ backgroundColor: b?.accent ?? "#111" }}
                        >
                          {u.name
                            .split(" ")
                            .map((p) => p[0])
                            .slice(0, 2)
                            .join("")}
                        </span>
                      )}
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 font-medium text-gray-800">
                          {u.name}
                          {online && <span className="h-2 w-2 rounded-full bg-emerald-500" title="Online now" />}
                          {u.deactivatedAt && (
                            <span className="text-[11px] font-normal text-gray-400">left</span>
                          )}
                        </p>
                        <p className="truncate text-xs text-gray-400">
                          {b?.shortName ?? u.brandId}
                          {u.location ? ` · ${u.location}` : ""}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${pay.cls}`}>
                      {pay.text}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-gray-700">{ago(u.lastSeenAt)}</td>
                  <td className="px-5 py-3">
                    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${USAGE_STYLE[use]}`}>
                      {USAGE_LABEL[use]}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-xs text-gray-500">
                    {[
                      u.appSeenAt ? "App" : null,
                      u.mobileSeenAt && !u.appSeenAt ? "Mobile" : null,
                      u.desktopSeenAt ? "Desktop" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </td>
                  <td className="px-5 py-3 text-right text-gray-700">{s?.total ?? 0}</td>
                  <td className="px-5 py-3 text-right text-gray-700">
                    {s?.converted ?? 0}
                    {s && s.total > 0 && (
                      <span className="ml-1 text-xs text-gray-400">
                        {Math.round((s.converted / s.total) * 100)}%
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-xs">
                    {u.msConnectedAt ? (
                      <span className="text-emerald-600">Connected</span>
                    ) : (
                      <span className="text-gray-400">Not connected</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-10 text-center text-sm text-gray-400">
                  Nobody matches those filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
