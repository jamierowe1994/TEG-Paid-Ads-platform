"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BRANDS, brandById } from "@/lib/brands";
import { packageById, PACKAGES } from "@/lib/packages";
import { stageLabel } from "@/lib/onboarding";
import BrandMark from "@/components/BrandMark";
import AgentProfile from "@/components/AgentProfile";
import type { UserProfile } from "@/lib/types";

// Admin backend. Password-gated (ADMIN_PASSWORD env var, default
// "experts-admin") — upgrade to proper admin accounts later.
//
// Tabs:
//  Overview    — live signup counts per brand + the feedback inbox
//  CRM         — every signup, drop-offs (started but never finished),
//                ads-in-production, password resets
//  Performance — cross-group comparison (fills in once Meta + leads live)
//  Connections — per-brand Meta connections + Atlas / REP / HighLevel / email

interface FeedbackItem {
  id: string;
  note: string;
  page: string;
  email: string | null;
  screenshot: string | null;
  createdAt: string;
}

interface SignupEvent {
  email: string;
  name: string;
  brandId: string | null;
  startedAt: string;
}

interface LeadSummary {
  userId: string;
  total: number;
  converted: number;
}

interface MetaSnapshot {
  brandId: string;
  account: { name: string; status: number; currency: string };
  impressions: number;
  clicks: number;
  spend: number;
  ctr: number;
  cpc: number;
  leads: number;
  costPerLead: number | null;
  datePreset: string;
}
interface MetaResult {
  brandId: string;
  snapshot?: MetaSnapshot;
  error?: string;
}
interface MetaStatus {
  tokenSet: boolean;
  results: MetaResult[];
  config: Record<string, { adAccountId: string | null; pageId: string | null }>;
}

interface LinkedInSnap {
  brandId: string;
  impressions: number;
  clicks: number;
  spend: number;
  leads: number;
  costPerLead: number | null;
}
interface LinkedInStatus {
  configured: boolean;
  connected: boolean;
  expiresAt: string | null;
  results: Array<{ brandId: string; snapshot?: LinkedInSnap; error?: string }>;
  config: Record<string, string | null>;
}

interface AtlasStatus {
  configured: boolean;
  ok: boolean;
  users?: number;
  error?: string;
}

type Tab = "overview" | "crm" | "performance" | "connections";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "crm", label: "CRM" },
  { id: "performance", label: "Performance" },
  { id: "connections", label: "Connections" },
];

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");

  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [starts, setStarts] = useState<SignupEvent[]>([]);
  const [leadSummaries, setLeadSummaries] = useState<LeadSummary[]>([]);
  const [meta, setMeta] = useState<MetaStatus | null>(null);
  const [linkedin, setLinkedin] = useState<LinkedInStatus | null>(null);
  const [atlas, setAtlas] = useState<AtlasStatus | null>(null);
  const [selected, setSelected] = useState<FeedbackItem | null>(null);

  // CRM view state
  const [selectedAgent, setSelectedAgent] = useState<UserProfile | null>(null);
  const [crmSort, setCrmSort] = useState<"recent" | "oldest" | "payHigh" | "payLow">(
    "recent"
  );
  const [crmPackage, setCrmPackage] = useState<"all" | "starter" | "growth" | "scale">(
    "all"
  );
  const [crmSearch, setCrmSearch] = useState("");

  async function loadData(pass: string): Promise<boolean> {
    const headers = { Authorization: `Bearer ${pass}` };
    const [fb, us, ev, ls, mt, li, at] = await Promise.all([
      fetch("/api/feedback", { headers }),
      fetch("/api/admin/users", { headers }),
      fetch("/api/track", { headers }),
      fetch("/api/admin/leads-summary", { headers }),
      fetch("/api/admin/meta", { headers }),
      fetch("/api/admin/linkedin", { headers }),
      fetch("/api/admin/atlas", { headers }),
    ]);
    if (!fb.ok || !us.ok || !ev.ok || !ls.ok) return false;
    setFeedback(await fb.json());
    setUsers(await us.json());
    setStarts(await ev.json());
    setLeadSummaries(await ls.json());
    setMeta(mt.ok ? await mt.json() : null);
    setLinkedin(li.ok ? await li.json() : null);
    setAtlas(at.ok ? await at.json() : null);
    return true;
  }

  // Save a brand's Meta ad account (Option B — no redeploy) and refresh.
  async function saveBrandMeta(brandId: string, adAccountId: string) {
    await fetch("/api/admin/meta", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${password}`,
      },
      body: JSON.stringify({ brandId, adAccountId }),
    });
    const res = await fetch("/api/admin/meta", {
      headers: { Authorization: `Bearer ${password}` },
    });
    if (res.ok) setMeta(await res.json());
  }

  // Start the LinkedIn OAuth connect (opens LinkedIn's login).
  async function connectLinkedIn() {
    const res = await fetch("/api/admin/linkedin", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${password}`,
      },
      body: JSON.stringify({ action: "connectUrl" }),
    });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
  }

  async function saveBrandLinkedIn(brandId: string, adAccount: string) {
    await fetch("/api/admin/linkedin", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${password}`,
      },
      body: JSON.stringify({ brandId, adAccount }),
    });
    const res = await fetch("/api/admin/linkedin", {
      headers: { Authorization: `Bearer ${password}` },
    });
    if (res.ok) setLinkedin(await res.json());
  }

  // Merge an updated agent record back into the list (and the open drawer)
  // after an edit in the profile, without a full reload.
  function applyAgentUpdate(u: UserProfile) {
    setUsers((prev) => prev.map((x) => (x.id === u.id ? u : x)));
    setSelectedAgent((cur) => (cur && cur.id === u.id ? u : cur));
  }

  async function signIn() {
    setLoading(true);
    setError("");
    const ok = await loadData(password).catch(() => false);
    setLoading(false);
    if (ok) {
      setAuthed(true);
      sessionStorage.setItem("teg_admin", password);
    } else {
      setError("Wrong password.");
    }
  }

  useEffect(() => {
    const saved = sessionStorage.getItem("teg_admin");
    if (!saved) return;
    loadData(saved).then((ok) => {
      if (ok) {
        setPassword(saved);
        setAuthed(true);
      }
    });
  }, []);

  // Filtered + sorted agents for the CRM table.
  const crmUsers = useMemo(() => {
    const q = crmSearch.trim().toLowerCase();
    let list = users.filter((u) => {
      if (crmPackage !== "all" && u.packageId !== crmPackage) return false;
      if (
        q &&
        !`${u.name} ${u.email} ${u.location ?? ""}`.toLowerCase().includes(q)
      )
        return false;
      return true;
    });
    const price = (u: UserProfile) => packageById(u.packageId)?.price ?? 0;
    list = [...list].sort((a, b) => {
      switch (crmSort) {
        case "recent":
          return b.createdAt.localeCompare(a.createdAt);
        case "oldest":
          return a.createdAt.localeCompare(b.createdAt);
        case "payHigh":
          return price(b) - price(a);
        case "payLow":
          return price(a) - price(b);
      }
    });
    return list;
  }, [users, crmSearch, crmPackage, crmSort]);

  const summaryFor = (userId: string) =>
    leadSummaries.find((s) => s.userId === userId);

  // Drop-offs: started the wizard but no completed account with that email.
  const dropOffs = useMemo(() => {
    const doneEmails = new Set(users.map((u) => u.email));
    return starts.filter((s) => !doneEmails.has(s.email));
  }, [users, starts]);

  // Per-brand roll-up: agents, spend, leads, conversions (leads are demo
  // seeds until Meta is live, but the plumbing is real).
  const brandStats = useMemo(() => {
    const byUser = new Map(leadSummaries.map((s) => [s.userId, s]));
    return BRANDS.map((b) => {
      const agents = users.filter((u) => u.brandId === b.id);
      let total = 0;
      let converted = 0;
      let spend = 0;
      for (const u of agents) {
        const s = byUser.get(u.id);
        total += s?.total ?? 0;
        converted += s?.converted ?? 0;
        spend += packageById(u.packageId)?.adSpend ?? 0;
      }
      return {
        brand: b,
        agents: agents.length,
        spend,
        total,
        converted,
        rate: total > 0 ? converted / total : null,
        cpl: total > 0 ? spend / total : null,
        spendPerConversion: converted > 0 ? spend / converted : null,
      };
    });
  }, [users, leadSummaries]);

  const bestBrand = useMemo(() => {
    const withData = brandStats.filter((s) => s.rate !== null);
    if (withData.length === 0) return null;
    return withData.reduce((a, b) => ((b.rate ?? 0) > (a.rate ?? 0) ? b : a));
  }, [brandStats]);

  if (!authed) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6">
        <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-8">
          <div className="mb-6 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-900 text-sm font-bold text-white">
              E
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold">The Experts Group</p>
              <p className="text-xs text-gray-400">Admin</p>
            </div>
          </div>
          <input
            autoFocus
            type="password"
            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-gray-900"
            placeholder="Admin password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && signIn()}
          />
          {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
          <button
            onClick={signIn}
            disabled={loading || !password}
            className="mt-4 w-full rounded-xl bg-gray-900 py-3 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {loading ? "Checking…" : "Sign in"}
          </button>
          <Link
            href="/"
            className="mt-6 block text-center text-xs text-gray-400 hover:text-gray-600"
          >
            ← Back to site
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-900 text-sm font-bold text-white">
              E
            </div>
            <span className="text-sm font-semibold">Admin</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <button
              onClick={() => loadData(password)}
              className="text-gray-500 hover:text-gray-900"
            >
              Refresh
            </button>
            <Link href="/" className="text-gray-500 hover:text-gray-900">
              View site
            </Link>
            <button
              onClick={() => {
                sessionStorage.removeItem("teg_admin");
                setAuthed(false);
                setPassword("");
              }}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-gray-500 hover:bg-gray-50"
            >
              Sign out
            </button>
          </div>
        </div>
        {/* Tabs */}
        <div className="mx-auto flex max-w-6xl gap-1 px-6">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`-mb-px border-b-2 px-4 py-3 text-sm font-medium transition ${
                tab === t.id
                  ? "border-gray-900 text-gray-900"
                  : "border-transparent text-gray-400 hover:text-gray-600"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-10">
        {/* ═══ OVERVIEW ═══ */}
        {tab === "overview" && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {BRANDS.map((b) => {
                const count = users.filter((u) => u.brandId === b.id).length;
                return (
                  <div
                    key={b.id}
                    className="rounded-2xl border border-gray-200 bg-white p-4"
                  >
                    <div className="flex items-center gap-2.5">
                      <BrandMark
                        name={b.name}
                        accent={b.accent}
                        logo={b.logo}
                        size={28}
                      />
                      <p className="text-sm font-medium">{b.shortName}</p>
                    </div>
                    <p className="mt-2 text-2xl font-semibold">{count}</p>
                    <p className="text-xs text-gray-400">
                      signed-up agent{count === 1 ? "" : "s"}
                    </p>
                  </div>
                );
              })}
            </div>

            <section className="mt-10">
              <h2 className="text-lg font-semibold">
                Feedback inbox{" "}
                <span className="text-sm font-normal text-gray-400">
                  {feedback.length} item{feedback.length === 1 ? "" : "s"}
                </span>
              </h2>
              <div className="mt-4 space-y-3">
                {feedback.map((f) => (
                  <div
                    key={f.id}
                    className="rounded-2xl border border-gray-200 bg-white p-5"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm text-gray-800">{f.note}</p>
                        <p className="mt-2 text-xs text-gray-400">
                          {f.email ?? "Anonymous"} · page {f.page || "/"} ·{" "}
                          {new Date(f.createdAt).toLocaleString("en-GB")}
                        </p>
                      </div>
                      {f.screenshot && (
                        <button
                          onClick={() => setSelected(f)}
                          className="shrink-0 overflow-hidden rounded-lg border border-gray-200 transition hover:ring-2 hover:ring-gray-300"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={f.screenshot}
                            alt="Feedback screenshot"
                            className="h-16 w-24 object-cover"
                          />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {feedback.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-gray-200 bg-white py-16 text-center text-sm text-gray-400">
                    No feedback yet. The widget on the bottom-right of every
                    page sends notes and annotated screenshots here.
                  </div>
                )}
              </div>
            </section>
          </>
        )}

        {/* ═══ CRM ═══ */}
        {tab === "crm" && (
          <>
            {/* Headline stats */}
            <div className="grid gap-4 sm:grid-cols-4">
              <AdminStat label="Signed up" value={String(users.length)} />
              <AdminStat
                label="Started, never finished"
                value={String(dropOffs.length)}
                note="Left the signup wizard"
              />
              <AdminStat
                label="Ads in production"
                value={String(users.length)}
                note="Every new signup until Meta is live"
              />
              <AdminStat
                label="Best converting brand"
                value={
                  bestBrand
                    ? `${bestBrand.brand.shortName} · ${Math.round((bestBrand.rate ?? 0) * 100)}%`
                    : "—"
                }
                note={bestBrand ? "Demo leads until Meta is live" : "Needs lead data"}
              />
            </div>

            {/* Signups — filterable, click a row for the full record */}
            <section className="mt-10">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">
                  Signed-up agents{" "}
                  <span className="text-sm font-normal text-gray-400">
                    {crmUsers.length}
                    {crmUsers.length !== users.length && ` of ${users.length}`}
                  </span>
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={crmSearch}
                    onChange={(e) => setCrmSearch(e.target.value)}
                    placeholder="Search name, email, location…"
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm outline-none focus:border-gray-900"
                  />
                  <select
                    value={crmPackage}
                    onChange={(e) =>
                      setCrmPackage(e.target.value as typeof crmPackage)
                    }
                    className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 outline-none focus:border-gray-900"
                  >
                    <option value="all">All packages</option>
                    {PACKAGES.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (£{p.price})
                      </option>
                    ))}
                  </select>
                  <select
                    value={crmSort}
                    onChange={(e) => setCrmSort(e.target.value as typeof crmSort)}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 outline-none focus:border-gray-900"
                  >
                    <option value="recent">Newest signup</option>
                    <option value="oldest">Oldest signup</option>
                    <option value="payHigh">Pays most</option>
                    <option value="payLow">Pays least</option>
                  </select>
                </div>
              </div>

              <div className="mt-4 overflow-x-auto rounded-2xl border border-gray-200 bg-white">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                    <tr>
                      <th className="px-5 py-3 font-medium">Agent</th>
                      <th className="px-5 py-3 font-medium">Business</th>
                      <th className="px-5 py-3 font-medium">Stage</th>
                      <th className="px-5 py-3 font-medium">Package</th>
                      <th className="px-5 py-3 font-medium">Signed up</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {crmUsers.map((u) => {
                      const b = brandById(u.brandId);
                      return (
                        <tr
                          key={u.id}
                          onClick={() => setSelectedAgent(u)}
                          className="cursor-pointer transition hover:bg-gray-50"
                        >
                          <td className="px-5 py-3">
                            <p className="font-medium text-gray-800">{u.name}</p>
                            <p className="text-xs text-gray-400">{u.email}</p>
                          </td>
                          <td className="px-5 py-3">
                            <span className="inline-flex items-center gap-2">
                              <span
                                className="h-2 w-2 rounded-full"
                                style={{ backgroundColor: b?.accent }}
                              />
                              {b?.shortName ?? u.brandId}
                            </span>
                          </td>
                          <td className="px-5 py-3">
                            <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                              {stageLabel(u.onboardingStage)}
                            </span>
                          </td>
                          <td className="px-5 py-3">
                            {packageById(u.packageId)?.name ?? u.packageId}
                            <span className="ml-1 text-xs text-gray-400">
                              £{packageById(u.packageId)?.price}/mo
                            </span>
                          </td>
                          <td className="px-5 py-3 text-gray-500">
                            {new Date(u.createdAt).toLocaleDateString("en-GB")}
                          </td>
                        </tr>
                      );
                    })}
                    {crmUsers.length === 0 && (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-5 py-12 text-center text-sm text-gray-400"
                        >
                          {users.length === 0
                            ? "No signups yet."
                            : "No agents match those filters."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Drop-offs */}
            <section className="mt-10">
              <h2 className="text-lg font-semibold">
                Started but never finished{" "}
                <span className="text-sm font-normal text-gray-400">
                  {dropOffs.length}
                </span>
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                People who got past the email step of signup but never
                completed. Worth a follow-up call.
              </p>
              <div className="mt-4 space-y-2">
                {dropOffs.map((d) => {
                  const b = brandById(d.brandId ?? undefined);
                  return (
                    <div
                      key={d.email}
                      className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-5 py-3"
                    >
                      <div>
                        <p className="text-sm font-medium">
                          {d.name || "Unknown name"}
                        </p>
                        <p className="text-xs text-gray-400">{d.email}</p>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-400">
                        {b && (
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ backgroundColor: b.accent }}
                            />
                            {b.shortName}
                          </span>
                        )}
                        <span>
                          {new Date(d.startedAt).toLocaleDateString("en-GB")}
                        </span>
                      </div>
                    </div>
                  );
                })}
                {dropOffs.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-gray-200 bg-white py-10 text-center text-sm text-gray-400">
                    No drop-offs — everyone who started signup finished it.
                  </div>
                )}
              </div>
            </section>
          </>
        )}

        {/* ═══ PERFORMANCE ═══ */}
        {tab === "performance" && (
          <>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
              Spend is real (from packages) and the lead/conversion plumbing
              is live — but leads are demo-seeded until Meta connects, so
              treat the rates below as placeholders for now.
            </div>

            <section className="mt-8">
              <h2 className="text-lg font-semibold">Brand comparison</h2>
              <div className="mt-4 overflow-x-auto rounded-2xl border border-gray-200 bg-white">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                    <tr>
                      <th className="px-5 py-3 font-medium">Brand</th>
                      <th className="px-5 py-3 font-medium">Agents</th>
                      <th className="px-5 py-3 font-medium">Ad spend / mo</th>
                      <th className="px-5 py-3 font-medium">Leads</th>
                      <th className="px-5 py-3 font-medium">Cost / lead</th>
                      <th className="px-5 py-3 font-medium">Conversion</th>
                      <th className="px-5 py-3 font-medium">
                        Spend / conversion
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {brandStats.map((s) => (
                      <tr key={s.brand.id}>
                        <td className="px-5 py-3">
                          <span className="inline-flex items-center gap-2 font-medium">
                            <BrandMark
                              name={s.brand.name}
                              accent={s.brand.accent}
                              logo={s.brand.logo}
                              size={22}
                              rounded="rounded-none"
                            />
                            {s.brand.shortName}
                          </span>
                        </td>
                        <td className="px-5 py-3">{s.agents}</td>
                        <td className="px-5 py-3">£{s.spend}</td>
                        <td className="px-5 py-3">
                          {s.total || <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-5 py-3">
                          {s.cpl !== null ? (
                            `£${s.cpl.toFixed(2)}`
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          {s.rate !== null ? (
                            `${Math.round(s.rate * 100)}%`
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          {s.spendPerConversion !== null ? (
                            `£${s.spendPerConversion.toFixed(2)}`
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="mt-8 grid gap-4 sm:grid-cols-3">
              <AdminStat
                label="Avg spend per conversion (group)"
                value={(() => {
                  const spend = brandStats.reduce((s, b) => s + b.spend, 0);
                  const conv = brandStats.reduce((s, b) => s + b.converted, 0);
                  return conv > 0 ? `£${(spend / conv).toFixed(2)}` : "—";
                })()}
                note="Total ad spend ÷ total conversions"
              />
              <AdminStat
                label="Best performing ads"
                value="—"
                note="Ranked by cost per lead, per campaign"
              />
              <AdminStat
                label="Cross-group referral conversions"
                value="—"
                note="Referrals that turned into business elsewhere"
              />
            </section>
          </>
        )}

        {/* ═══ CONNECTIONS ═══ */}
        {tab === "connections" && (
          <>
            {/* Live Meta stats — one card per connected brand */}
            <section className="mb-10">
              <h2 className="text-lg font-semibold">Meta connection (live)</h2>
              {!meta || meta.results.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-700">
                  <p className="font-medium">No brands connected yet.</p>
                  <p className="mt-1">
                    Add <code>META_SYSTEM_TOKEN</code>,{" "}
                    <code>META_APP_SECRET</code> and a{" "}
                    <code>META_AD_ACCOUNT_&lt;BRAND&gt;</code> in Railway
                    (e.g. <code>META_AD_ACCOUNT_RECRUITMENT</code>), then
                    redeploy. Each brand appears here as its account is added.
                  </p>
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  {meta.results.map((r) => {
                    const b = brandById(r.brandId);
                    if (r.error) {
                      return (
                        <div
                          key={r.brandId}
                          className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
                        >
                          <p className="font-medium">
                            {b?.name ?? r.brandId} — Meta error
                          </p>
                          <p className="mt-1 font-mono text-xs">{r.error}</p>
                        </div>
                      );
                    }
                    const s = r.snapshot!;
                    return (
                      <div
                        key={r.brandId}
                        className="rounded-2xl border border-gray-200 bg-white p-5"
                      >
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
                          <span
                            className="inline-flex items-center gap-1.5 text-sm font-medium"
                          >
                            {b && (
                              <span
                                className="h-2 w-2 rounded-full"
                                style={{ backgroundColor: b.accent }}
                              />
                            )}
                            {b?.name ?? r.brandId}
                          </span>
                          <span className="text-xs text-gray-400">
                            {s.account.name} · last 30 days
                          </span>
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
                          {[
                            {
                              label: "Spend",
                              value: `£${s.spend.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`,
                            },
                            {
                              label: "Impressions",
                              value: s.impressions.toLocaleString("en-GB"),
                            },
                            {
                              label: "Clicks",
                              value: s.clicks.toLocaleString("en-GB"),
                            },
                            { label: "Leads", value: String(s.leads) },
                            {
                              label: "Cost / lead",
                              value:
                                s.costPerLead === null
                                  ? "—"
                                  : `£${s.costPerLead.toFixed(2)}`,
                            },
                          ].map((stat) => (
                            <div
                              key={stat.label}
                              className="rounded-xl border border-gray-100 p-3"
                            >
                              <p className="text-xs text-gray-400">
                                {stat.label}
                              </p>
                              <p className="mt-0.5 text-lg font-semibold">
                                {stat.value}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Meta — connect each brand by pasting its ad account ID.
                Shares the one System User token; saved to the DB, no
                redeploy. */}
            <section>
              <h2 className="text-lg font-semibold">Meta Ads — per brand</h2>
              <p className="mt-1 max-w-2xl text-sm text-gray-500">
                Paste each business's <strong>Ad Account ID</strong> to connect
                it (add its Page + Ad account to the "Portal Server" system
                user first). Saves instantly — no redeploy. Clear the box to
                disconnect.
              </p>
              <div className="mt-4 space-y-3">
                {BRANDS.map((b) => {
                  const res = meta?.results.find((r) => r.brandId === b.id);
                  const connected = !!res?.snapshot;
                  const err = res?.error;
                  const current = meta?.config?.[b.id]?.adAccountId ?? "";
                  return (
                    <div
                      key={b.id}
                      className="flex flex-wrap items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4"
                    >
                      <div className="flex min-w-[220px] flex-1 items-center gap-3">
                        <BrandMark
                          name={b.name}
                          accent={b.accent}
                          logo={b.logo}
                          size={30}
                        />
                        <div>
                          <p className="text-sm font-medium">{b.name}</p>
                          <p className="flex items-center gap-1.5 text-xs text-gray-400">
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-green-500" : err ? "bg-red-500" : "bg-amber-400"}`}
                            />
                            {connected
                              ? `Connected — ${res!.snapshot!.account.name}`
                              : err
                                ? err
                                : "Not connected"}
                          </p>
                        </div>
                      </div>
                      <input
                        defaultValue={current}
                        placeholder="Ad Account ID (act_…)"
                        className="w-44 rounded-lg border border-gray-200 px-3 py-1.5 text-sm outline-none focus:border-gray-900"
                        onKeyDown={(e) => {
                          if (e.key === "Enter")
                            saveBrandMeta(b.id, e.currentTarget.value);
                        }}
                        id={`meta-${b.id}`}
                      />
                      <button
                        onClick={() => {
                          const el = document.getElementById(
                            `meta-${b.id}`
                          ) as HTMLInputElement | null;
                          saveBrandMeta(b.id, el?.value ?? "");
                        }}
                        className="rounded-lg bg-gray-900 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-gray-700"
                      >
                        Save
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* LinkedIn Ads */}
            <section className="mt-10">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">LinkedIn Ads</h2>
                {linkedin && (
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1.5 text-xs text-gray-500">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${linkedin.connected ? "bg-green-500" : linkedin.configured ? "bg-amber-400" : "bg-gray-300"}`}
                      />
                      {linkedin.connected
                        ? "Connected"
                        : linkedin.configured
                          ? "Not connected"
                          : "App keys not set"}
                    </span>
                    {linkedin.configured && (
                      <button
                        onClick={connectLinkedIn}
                        className="rounded-lg bg-[#0A66C2] px-3.5 py-1.5 text-xs font-medium text-white hover:opacity-90"
                      >
                        {linkedin.connected ? "Reconnect" : "Connect LinkedIn"}
                      </button>
                    )}
                  </div>
                )}
              </div>
              {linkedin && !linkedin.configured ? (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-700">
                  <p className="font-medium">App keys not set.</p>
                  <p className="mt-1">
                    Add <code>LINKEDIN_CLIENT_ID</code> and{" "}
                    <code>LINKEDIN_CLIENT_SECRET</code> (from the LinkedIn app →
                    Auth tab) in Railway, and register the redirect URL{" "}
                    <code>{"{APP_URL}"}/api/linkedin/callback</code>. Then hit
                    Connect.
                  </p>
                </div>
              ) : (
                <>
                  <p className="mt-1 max-w-2xl text-sm text-gray-500">
                    Connect once with LinkedIn, then paste each brand's{" "}
                    <strong>Sponsored Account ID</strong> (from Campaign
                    Manager). Token auto-refreshes.
                  </p>
                  <div className="mt-4 space-y-3">
                    {BRANDS.map((b) => {
                      const res = linkedin?.results.find(
                        (r) => r.brandId === b.id
                      );
                      const connected = !!res?.snapshot;
                      const err = res?.error;
                      const current = linkedin?.config?.[b.id] ?? "";
                      const s = res?.snapshot;
                      return (
                        <div
                          key={b.id}
                          className="flex flex-wrap items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4"
                        >
                          <div className="flex min-w-[220px] flex-1 items-center gap-3">
                            <BrandMark
                              name={b.name}
                              accent={b.accent}
                              logo={b.logo}
                              size={30}
                            />
                            <div>
                              <p className="text-sm font-medium">{b.name}</p>
                              <p className="flex items-center gap-1.5 text-xs text-gray-400">
                                <span
                                  className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-green-500" : err ? "bg-red-500" : "bg-amber-400"}`}
                                />
                                {connected && s
                                  ? `£${s.spend.toLocaleString("en-GB", { maximumFractionDigits: 0 })} · ${s.clicks} clicks · ${s.leads} leads (30d)`
                                  : err
                                    ? err
                                    : "No account set"}
                              </p>
                            </div>
                          </div>
                          <input
                            defaultValue={current ?? ""}
                            placeholder="Sponsored Account ID"
                            className="w-44 rounded-lg border border-gray-200 px-3 py-1.5 text-sm outline-none focus:border-gray-900"
                            id={`li-${b.id}`}
                          />
                          <button
                            onClick={() => {
                              const el = document.getElementById(
                                `li-${b.id}`
                              ) as HTMLInputElement | null;
                              saveBrandLinkedIn(b.id, el?.value ?? "");
                            }}
                            className="rounded-lg bg-gray-900 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-gray-700"
                          >
                            Save
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </section>

            {/* Atlas CRM (The Recruitment Experts) */}
            <section className="mt-10">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">Atlas CRM</h2>
                {atlas && (
                  <span className="flex items-center gap-1.5 text-xs text-gray-500">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${atlas.ok ? "bg-green-500" : atlas.configured ? "bg-red-500" : "bg-gray-300"}`}
                    />
                    {atlas.ok
                      ? "Connected"
                      : atlas.configured
                        ? "Key set — connection failed"
                        : "Key not set"}
                  </span>
                )}
              </div>
              <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-5">
                <div className="flex items-center gap-3">
                  <BrandMark
                    name="The Recruitment Experts"
                    accent="#111827"
                    logo={null}
                    size={30}
                  />
                  <div>
                    <p className="text-sm font-medium">The Recruitment Experts</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-400">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${atlas?.ok ? "bg-green-500" : atlas?.configured ? "bg-red-500" : "bg-amber-400"}`}
                      />
                      {atlas?.ok
                        ? `Connected${typeof atlas.users === "number" ? ` — ${atlas.users} Atlas ${atlas.users === 1 ? "user" : "users"}` : ""}`
                        : atlas?.configured
                          ? atlas.error ?? "Connection failed"
                          : "Add ATLAS_API_KEY in Railway"}
                    </p>
                  </div>
                </div>
                <p className="mt-3 max-w-2xl text-xs text-gray-500">
                  Recruiters push a converted lead into Atlas from their Leads
                  funnel — the person is created with their note attached, in the
                  recruiter&apos;s own name. Nothing to configure per brand.
                </p>
              </div>
            </section>

            {/* Other systems */}
            <section className="mt-10">
              <h2 className="text-lg font-semibold">Systems</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {[
                  {
                    name: "REP",
                    desc: "Property/Lettings CRM — push converted MAs",
                  },
                  {
                    name: "HighLevel",
                    desc: "Marketing funnels — nurture unanswered leads",
                  },
                  {
                    name: "info@theexpertsgroup email",
                    desc: "Sends password resets, welcome emails and lead alerts",
                  },
                ].map((s) => (
                  <div
                    key={s.name}
                    className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white p-4"
                  >
                    <div>
                      <p className="text-sm font-medium">{s.name}</p>
                      <p className="mt-0.5 text-xs text-gray-400">{s.desc}</p>
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                        Not connected
                      </p>
                    </div>
                    <button
                      disabled
                      title="Integration coming soon"
                      className="rounded-lg bg-gray-900 px-3.5 py-1.5 text-xs font-medium text-white opacity-40"
                    >
                      Connect
                    </button>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>

      {/* Screenshot viewer */}
      {selected?.screenshot && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 p-8"
          onClick={() => setSelected(null)}
        >
          <div className="max-h-full max-w-4xl overflow-auto rounded-2xl bg-white p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selected.screenshot}
              alt="Feedback screenshot"
              className="rounded-lg"
            />
            <p className="mt-3 text-sm text-gray-700">{selected.note}</p>
          </div>
        </div>
      )}

      {/* Agent CRM record */}
      {selectedAgent && (
        <AgentProfile
          agent={selectedAgent}
          summary={summaryFor(selectedAgent.id)}
          adminPassword={password}
          onClose={() => setSelectedAgent(null)}
          onUpdated={applyAgentUpdate}
        />
      )}
    </main>
  );
}

function AdminStat({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
      {note && <p className="mt-1 text-xs text-gray-400">{note}</p>}
    </div>
  );
}
