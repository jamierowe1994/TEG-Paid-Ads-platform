"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BRANDS, brandById, type Brand } from "@/lib/brands";
import { packageById, PACKAGES } from "@/lib/packages";
import { stageLabel } from "@/lib/onboarding";
import BrandMark from "@/components/BrandMark";
import AgentProfile from "@/components/AgentProfile";
import type { UserProfile, Referral } from "@/lib/types";

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
  speedMs: number | null;
  speedSamples: number;
}

interface AdRow {
  adName: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  cpl: number | null;
}

// Human-friendly duration (mirrors the customer leads page).
function fmtDuration(ms: number): string {
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h < 24) return m ? `${h}h ${m}m` : `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

const DATE_PRESETS = [
  { id: "last_7d", label: "7 days" },
  { id: "last_14d", label: "14 days" },
  { id: "last_30d", label: "30 days" },
  { id: "last_90d", label: "90 days" },
] as const;

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
  leadBreakdown?: { type: string; value: number }[];
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

type Tab =
  | "overview"
  | "activity"
  | "referrals"
  | "crm"
  | "performance"
  | "connections";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "activity", label: "Activity" },
  { id: "referrals", label: "Referrals" },
  { id: "crm", label: "CRM" },
  { id: "performance", label: "Performance" },
  { id: "connections", label: "Connections" },
];

const REFERRAL_STATUS_STYLE: Record<Referral["status"], string> = {
  pending: "bg-amber-50 text-amber-600",
  accepted: "bg-blue-50 text-blue-600",
  converted: "bg-green-50 text-green-600",
  paid: "bg-gray-900 text-white",
  declined: "bg-gray-100 text-gray-500",
};

interface ActivityEvent {
  at: string;
  type: "new_lead" | "converted" | "pushed" | "lost" | "signup";
  agentName: string;
  brandId: string;
  leadName?: string;
  source?: string;
}
interface AttentionItem {
  kind: "unanswered" | "cold";
  leadName: string;
  agentName: string;
  userId: string;
  brandId: string;
  ageMs: number;
}
interface ActivityLead {
  id: string;
  leadName: string;
  agentName: string;
  userId: string;
  brandId: string;
  source: string;
  stage: string;
  receivedAt: string;
  lastAt: string;
  appointmentAt: string | null;
  history: { stage: string; at: string }[];
  notes: { at: string; text: string }[];
}
interface ActivityData {
  events: ActivityEvent[];
  attention: AttentionItem[];
  leads: ActivityLead[];
}

// Lead funnel stages → readable labels for the activity CRM table.
const LEAD_STAGE_LABEL: Record<string, string> = {
  new: "New",
  attempt1: "Attempt 1",
  attempt2: "Attempt 2",
  attempt3: "Attempt 3",
  nurture: "In marketing funnel",
  converted: "Converted",
  pushed: "In CRM",
  lost: "Lost",
};

const LEAD_STAGE_STYLE: Record<string, string> = {
  new: "bg-blue-50 text-blue-600",
  attempt1: "bg-amber-50 text-amber-600",
  attempt2: "bg-amber-50 text-amber-600",
  attempt3: "bg-amber-50 text-amber-600",
  nurture: "bg-purple-50 text-purple-600",
  converted: "bg-green-50 text-green-600",
  pushed: "bg-green-50 text-green-600",
  lost: "bg-gray-100 text-gray-500",
};

function ago(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function agoDur(ms: number): string {
  const h = Math.floor(ms / 3600000);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

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
  const [metaPreset, setMetaPreset] = useState<string>("last_30d");
  const [drillBrand, setDrillBrand] = useState<string | null>(null);
  const [activity, setActivity] = useState<ActivityData | null>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [selected, setSelected] = useState<FeedbackItem | null>(null);
  const [openLead, setOpenLead] = useState<ActivityLead | null>(null);
  const [nudging, setNudging] = useState<string | null>(null);
  const [toast, setToast] = useState("");

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
    const [fb, us, ev, ls, mt, li, at, ac, rf] = await Promise.all([
      fetch("/api/feedback", { headers }),
      fetch("/api/admin/users", { headers }),
      fetch("/api/track", { headers }),
      fetch("/api/admin/leads-summary", { headers }),
      fetch("/api/admin/meta", { headers }),
      fetch("/api/admin/linkedin", { headers }),
      fetch("/api/admin/atlas", { headers }),
      fetch("/api/admin/activity", { headers }),
      fetch("/api/admin/referrals", { headers }),
    ]);
    if (!fb.ok || !us.ok || !ev.ok || !ls.ok) return false;
    setFeedback(await fb.json());
    setUsers(await us.json());
    setStarts(await ev.json());
    setLeadSummaries(await ls.json());
    setMeta(mt.ok ? await mt.json() : null);
    setLinkedin(li.ok ? await li.json() : null);
    setAtlas(at.ok ? await at.json() : null);
    setActivity(ac.ok ? await ac.json() : null);
    setReferrals(rf.ok ? await rf.json() : []);
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

  // Re-pull Meta stats for a different date range (Performance tab + drill-down).
  async function refetchMeta(preset: string) {
    setMetaPreset(preset);
    const res = await fetch(`/api/admin/meta?preset=${preset}`, {
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

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 4000);
  }

  // Nudge an agent by WhatsApp to go back to a cold/unanswered lead.
  async function nudgeAgent(userId: string, leadName: string, key: string) {
    setNudging(key);
    try {
      const res = await fetch("/api/admin/nudge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${password}`,
        },
        body: JSON.stringify({ userId, leadName }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok) {
        flash(`WhatsApp reminder sent to ${data.agentName ?? "the agent"} ✓`);
      } else if (data.reason === "not_configured") {
        flash("WhatsApp isn't live yet — reminder couldn't be sent.");
      } else if (data.reason === "no_mobile") {
        flash("That agent has no mobile number on file.");
      } else if (data.reason === "bad_number") {
        flash("That agent's mobile number doesn't look valid.");
      } else {
        flash(`Couldn't send — ${data.reason ?? data.error ?? "try again"}.`);
      }
    } catch {
      flash("Couldn't send the reminder — network error.");
    } finally {
      setNudging(null);
    }
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

  // Per-brand roll-up. Spend + leads come LIVE from Meta for any connected
  // brand (last 30 days); otherwise we fall back to the package ad-spend
  // estimate. Agents are real user counts; conversion is the portal funnel
  // (appointments booked ÷ leads worked), which grows as agents use it.
  const brandStats = useMemo(() => {
    const byUser = new Map(leadSummaries.map((s) => [s.userId, s]));
    return BRANDS.map((b) => {
      const agents = users.filter((u) => u.brandId === b.id);
      let portalLeads = 0;
      let converted = 0;
      let estSpend = 0;
      for (const u of agents) {
        const s = byUser.get(u.id);
        portalLeads += s?.total ?? 0;
        converted += s?.converted ?? 0;
        estSpend += packageById(u.packageId)?.adSpend ?? 0;
      }
      // Weighted avg speed-to-lead across this brand's agents.
      let speedSum = 0;
      let speedN = 0;
      for (const u of agents) {
        const s = byUser.get(u.id);
        if (s?.speedMs != null && s.speedSamples > 0) {
          speedSum += s.speedMs * s.speedSamples;
          speedN += s.speedSamples;
        }
      }
      const snap = meta?.results.find((r) => r.brandId === b.id)?.snapshot;
      const live = !!snap;
      const spend = live ? snap!.spend : estSpend;
      const leads = live ? snap!.leads : portalLeads;
      const clicks = live ? snap!.clicks : null;
      return {
        brand: b,
        live,
        agents: agents.length,
        spend,
        leads,
        clicks,
        converted,
        rate: portalLeads > 0 ? converted / portalLeads : null,
        cpl: leads > 0 ? spend / leads : null,
        spendPerConversion: converted > 0 ? spend / converted : null,
        speedMs: speedN > 0 ? speedSum / speedN : null,
      };
    });
  }, [users, leadSummaries, meta]);

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
            {(() => {
              const awaitingLive = users.filter(
                (u) => u.onboardingStage === "review" && u.campaignApproved
              );
              const awaitingApproval = users.filter(
                (u) => u.onboardingStage === "review" && !u.campaignApproved
              );
              if (awaitingLive.length === 0 && awaitingApproval.length === 0) {
                return null;
              }
              return (
                <div className="mb-6 space-y-2">
                  {awaitingLive.length > 0 && (
                    <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
                      ✅ <strong>{awaitingLive.length}</strong> customer
                      {awaitingLive.length === 1 ? " has" : "s have"} approved —
                      ready to set live:{" "}
                      <span className="font-medium">
                        {awaitingLive.map((u) => u.name).join(", ")}
                      </span>
                      . Open their record → move to <em>Ads live</em>.
                    </div>
                  )}
                  {awaitingApproval.length > 0 && (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
                      ⏳ <strong>{awaitingApproval.length}</strong> awaiting
                      customer approval:{" "}
                      <span className="font-medium">
                        {awaitingApproval.map((u) => u.name).join(", ")}
                      </span>
                      .
                    </div>
                  )}
                </div>
              );
            })()}
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

        {/* ═══ ACTIVITY ═══ */}
        {tab === "activity" && (
          <>
            {/* Attention needed — unanswered / cold leads, with a nudge button */}
            <section>
              <h2 className="text-lg font-semibold">Attention needed</h2>
              <p className="mt-1 text-sm text-gray-500">
                Leads going unanswered (&gt;1 day) or cold (no activity &gt;2
                days). Send the agent a WhatsApp to jump back on them.
              </p>
              <div className="mt-4 space-y-2">
                {(activity?.attention ?? []).slice(0, 20).map((a, i) => {
                  const b = brandById(a.brandId);
                  const key = `${a.userId}-${a.leadName}-${i}`;
                  return (
                    <div
                      key={key}
                      className={`flex flex-wrap items-center gap-3 rounded-2xl border p-3.5 ${
                        a.kind === "unanswered"
                          ? "border-red-200 bg-red-50"
                          : "border-amber-200 bg-amber-50"
                      }`}
                    >
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          a.kind === "unanswered"
                            ? "bg-red-100 text-red-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {a.kind === "unanswered" ? "Unanswered" : "Going cold"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {a.leadName}
                        </p>
                        <p className="text-xs text-gray-500">
                          {b?.shortName ?? a.brandId} · {a.agentName}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-semibold text-gray-700">
                        {agoDur(a.ageMs)}
                      </span>
                      <button
                        onClick={() => nudgeAgent(a.userId, a.leadName, key)}
                        disabled={nudging === key}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#25D366] px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          className="h-3.5 w-3.5"
                          fill="currentColor"
                        >
                          <path d="M12 2a10 10 0 0 0-8.6 15l-1.3 4.8 4.9-1.3A10 10 0 1 0 12 2zm0 2a8 8 0 1 1-4.2 14.8l-.3-.2-2.9.8.8-2.8-.2-.3A8 8 0 0 1 12 4zm4.5 10.3c-.2-.1-1.3-.7-1.5-.8s-.4-.1-.5.1-.6.8-.7.9-.3.2-.5.1a6.5 6.5 0 0 1-3.2-2.8c-.2-.4.2-.4.6-1.2a.4.4 0 0 0 0-.4l-.7-1.7c-.2-.5-.4-.4-.5-.4h-.5a.9.9 0 0 0-.7.3A2.8 2.8 0 0 0 7 11c0 1.6 1.2 3.2 1.4 3.4a9.3 9.3 0 0 0 3.9 3.2c1.4.6 1.9.6 2.6.5a2.3 2.3 0 0 0 1.5-1.1 1.9 1.9 0 0 0 .1-1c-.1-.1-.3-.2-.5-.3z" />
                        </svg>
                        {nudging === key ? "Sending…" : "Send WhatsApp again"}
                      </button>
                    </div>
                  );
                })}
                {(activity?.attention ?? []).length === 0 && (
                  <div className="rounded-2xl border border-dashed border-gray-200 bg-white py-10 text-center text-sm text-gray-400">
                    Nothing needs chasing — every lead's been actioned. 🎉
                  </div>
                )}
              </div>
            </section>

            {/* Live activity — CRM-style lead table, click a row for the full picture */}
            <section className="mt-10">
              <h2 className="text-lg font-semibold">Live activity</h2>
              <p className="mt-1 text-sm text-gray-500">
                Every lead across the group, newest activity first. Click any row
                to see the full timeline — including whether a lost lead went into
                the marketing funnel.
              </p>
              <div className="mt-4 overflow-x-auto rounded-2xl border border-gray-200 bg-white">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                    <tr>
                      <th className="px-5 py-3 font-medium">Lead</th>
                      <th className="px-5 py-3 font-medium">Business · Agent</th>
                      <th className="px-5 py-3 font-medium">Source</th>
                      <th className="px-5 py-3 font-medium">Status</th>
                      <th className="px-5 py-3 font-medium">Funnel</th>
                      <th className="px-5 py-3 font-medium">Updated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {(activity?.leads ?? []).map((l) => {
                      const b = brandById(l.brandId);
                      return (
                        <tr
                          key={l.id}
                          onClick={() => setOpenLead(l)}
                          className="cursor-pointer transition hover:bg-gray-50"
                        >
                          <td className="px-5 py-3 font-medium text-gray-800">
                            {l.leadName}
                          </td>
                          <td className="px-5 py-3">
                            <span className="inline-flex items-center gap-2">
                              <span
                                className="h-2 w-2 rounded-full"
                                style={{ backgroundColor: b?.accent }}
                              />
                              {b?.shortName ?? l.brandId}
                              <span className="text-gray-400">· {l.agentName}</span>
                            </span>
                          </td>
                          <td className="px-5 py-3 capitalize text-gray-500">
                            {l.source}
                          </td>
                          <td className="px-5 py-3">
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${LEAD_STAGE_STYLE[l.stage] ?? "bg-gray-100 text-gray-500"}`}
                            >
                              {LEAD_STAGE_LABEL[l.stage] ?? l.stage}
                            </span>
                          </td>
                          <td className="px-5 py-3">
                            {l.stage === "nurture" ? (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-purple-600">
                                ✓ In funnel
                              </span>
                            ) : l.stage === "lost" ? (
                              <span className="text-xs font-medium text-gray-400">
                                Not in funnel
                              </span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                          <td className="px-5 py-3 text-gray-500">
                            {ago(l.lastAt)}
                          </td>
                        </tr>
                      );
                    })}
                    {(activity?.leads ?? []).length === 0 && (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-5 py-12 text-center text-sm text-gray-400"
                        >
                          No leads yet — this fills in as leads arrive.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {/* ═══ REFERRALS ═══ */}
        {tab === "referrals" && (
          <>
            <div className="grid gap-4 sm:grid-cols-4">
              <AdminStat label="Total referrals" value={String(referrals.length)} />
              <AdminStat
                label="Awaiting acceptance"
                value={String(
                  referrals.filter((r) => r.status === "pending").length
                )}
              />
              <AdminStat
                label="Converted"
                value={String(
                  referrals.filter(
                    (r) => r.status === "converted" || r.status === "paid"
                  ).length
                )}
                note="Fee earned or now due"
              />
              <AdminStat
                label="Fees paid out"
                value={`£${referrals
                  .filter((r) => r.status === "paid")
                  .reduce((t, r) => t + r.feeAmount, 0)
                  .toLocaleString("en-GB")}`}
              />
            </div>

            <section className="mt-10">
              <h2 className="text-lg font-semibold">
                All referrals{" "}
                <span className="text-sm font-normal text-gray-400">
                  {referrals.length}
                </span>
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Every referral passed between the businesses — who sent what,
                where it went, and where it&apos;s got to.
              </p>
              <div className="mt-4 overflow-x-auto rounded-2xl border border-gray-200 bg-white">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                    <tr>
                      <th className="px-5 py-3 font-medium">Lead</th>
                      <th className="px-5 py-3 font-medium">From</th>
                      <th className="px-5 py-3 font-medium">To</th>
                      <th className="px-5 py-3 font-medium">Fee</th>
                      <th className="px-5 py-3 font-medium">Status</th>
                      <th className="px-5 py-3 font-medium">Sent</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {referrals.map((r) => {
                      const from = brandById(r.fromBrandId);
                      const to = brandById(r.toBrandId);
                      return (
                        <tr key={r.id}>
                          <td className="px-5 py-3">
                            <p className="font-medium text-gray-800">
                              {r.leadName}
                            </p>
                            {r.leadPhone && (
                              <p className="text-xs text-gray-400">
                                {r.leadPhone}
                              </p>
                            )}
                          </td>
                          <td className="px-5 py-3">
                            <span className="inline-flex items-center gap-2">
                              <span
                                className="h-2 w-2 rounded-full"
                                style={{ backgroundColor: from?.accent }}
                              />
                              <span>
                                {from?.shortName ?? r.fromBrandId}
                                <span className="block text-xs text-gray-400">
                                  {r.fromName}
                                </span>
                              </span>
                            </span>
                          </td>
                          <td className="px-5 py-3">
                            <span className="inline-flex items-center gap-2">
                              <span
                                className="h-2 w-2 rounded-full"
                                style={{ backgroundColor: to?.accent }}
                              />
                              {to?.shortName ?? r.toBrandId}
                            </span>
                          </td>
                          <td className="px-5 py-3 font-medium">
                            £{r.feeAmount.toLocaleString("en-GB")}
                          </td>
                          <td className="px-5 py-3">
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${REFERRAL_STATUS_STYLE[r.status]}`}
                            >
                              {r.status}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-gray-500">
                            {new Date(r.createdAt).toLocaleDateString("en-GB")}
                          </td>
                        </tr>
                      );
                    })}
                    {referrals.length === 0 && (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-5 py-12 text-center text-sm text-gray-400"
                        >
                          No referrals yet — they&apos;ll appear here as agents
                          pass leads between the businesses.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
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
            {/* Date-range control — re-pulls Meta for the whole tab */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
                <strong>{brandStats.filter((s) => s.live).length}</strong> of{" "}
                {brandStats.length} brands pulling{" "}
                <strong>live spend &amp; leads from Meta</strong>. Click a brand
                to drill in. Conversion &amp; speed-to-lead come from the portal
                funnel.
              </div>
              <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white p-1">
                {DATE_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => refetchMeta(p.id)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                      metaPreset === p.id
                        ? "bg-gray-900 text-white"
                        : "text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Group totals across the connected brands */}
            <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <AdminStat
                label="Total spend (live)"
                value={`£${brandStats
                  .filter((s) => s.live)
                  .reduce((t, s) => t + s.spend, 0)
                  .toLocaleString("en-GB", { maximumFractionDigits: 0 })}`}
                note={DATE_PRESETS.find((p) => p.id === metaPreset)?.label}
              />
              <AdminStat
                label="Total leads (live)"
                value={brandStats
                  .filter((s) => s.live)
                  .reduce((t, s) => t + s.leads, 0)
                  .toLocaleString("en-GB")}
              />
              <AdminStat
                label="Blended cost / lead"
                value={(() => {
                  const live = brandStats.filter((s) => s.live);
                  const spend = live.reduce((t, s) => t + s.spend, 0);
                  const leads = live.reduce((t, s) => t + s.leads, 0);
                  return leads > 0 ? `£${(spend / leads).toFixed(2)}` : "—";
                })()}
              />
              <AdminStat
                label="Avg speed to lead"
                value={(() => {
                  const s = brandStats.filter((b) => b.speedMs != null);
                  if (s.length === 0) return "—";
                  // Sample-weighted group average.
                  const summaries = leadSummaries.filter(
                    (ls) => ls.speedMs != null && ls.speedSamples > 0
                  );
                  const sum = summaries.reduce(
                    (t, ls) => t + (ls.speedMs as number) * ls.speedSamples,
                    0
                  );
                  const n = summaries.reduce((t, ls) => t + ls.speedSamples, 0);
                  return n > 0 ? fmtDuration(sum / n) : "—";
                })()}
                note="Group avg, lower is better"
              />
              <AdminStat
                label="Agents signed up"
                value={String(brandStats.reduce((t, s) => t + s.agents, 0))}
                note="Across all brands"
              />
            </section>

            <section className="mt-8">
              <h2 className="text-lg font-semibold">Brand comparison</h2>
              <div className="mt-4 overflow-x-auto rounded-2xl border border-gray-200 bg-white">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                    <tr>
                      <th className="px-5 py-3 font-medium">Brand</th>
                      <th className="px-5 py-3 font-medium">Agents</th>
                      <th className="px-5 py-3 font-medium">Spend</th>
                      <th className="px-5 py-3 font-medium">Leads</th>
                      <th className="px-5 py-3 font-medium">Clicks</th>
                      <th className="px-5 py-3 font-medium">Cost / lead</th>
                      <th className="px-5 py-3 font-medium">Conversion</th>
                      <th className="px-5 py-3 font-medium">Speed</th>
                      <th className="px-5 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {brandStats.map((s) => (
                      <tr
                        key={s.brand.id}
                        onClick={s.live ? () => setDrillBrand(s.brand.id) : undefined}
                        className={s.live ? "cursor-pointer hover:bg-gray-50" : ""}
                      >
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
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${s.live ? "bg-green-500" : "bg-gray-300"}`}
                              title={s.live ? "Live from Meta" : "Not connected"}
                            />
                          </span>
                        </td>
                        <td className="px-5 py-3">{s.agents}</td>
                        <td className="px-5 py-3">
                          £
                          {s.spend.toLocaleString("en-GB", {
                            maximumFractionDigits: 0,
                          })}
                          {!s.live && (
                            <span className="ml-1 text-xs text-gray-300">est</span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          {s.leads || <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-5 py-3">
                          {s.clicks !== null ? (
                            s.clicks.toLocaleString("en-GB")
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
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
                          {s.speedMs !== null ? (
                            fmtDuration(s.speedMs)
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-right text-gray-300">
                          {s.live && "→"}
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
                value="Per brand"
                note="Click a brand row above to see its top ads"
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
                        {s.leadBreakdown && s.leadBreakdown.length > 0 && (
                          <details className="mt-3 text-xs">
                            <summary className="cursor-pointer text-gray-400 hover:text-gray-600">
                              Leads breakdown (reconcile vs Ads Manager)
                            </summary>
                            <div className="mt-2 space-y-1 rounded-xl bg-gray-50 p-3">
                              <p className="text-gray-500">
                                We count the{" "}
                                <code className="rounded bg-white px-1">lead</code>{" "}
                                action (Ads Manager&apos;s Leads column). Meta also
                                reports overlapping types for the same leads — do
                                <strong> not</strong> add these up:
                              </p>
                              {s.leadBreakdown.map((lb) => (
                                <div
                                  key={lb.type}
                                  className="flex justify-between font-mono text-gray-600"
                                >
                                  <span>{lb.type}</span>
                                  <span>{lb.value.toLocaleString("en-GB")}</span>
                                </div>
                              ))}
                              <div className="mt-1 flex justify-between border-t border-gray-200 pt-1 font-medium text-gray-900">
                                <span>Counted total</span>
                                <span>{s.leads.toLocaleString("en-GB")}</span>
                              </div>
                            </div>
                          </details>
                        )}
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

      {/* Per-brand drill-down */}
      {drillBrand &&
        (() => {
          const s = brandStats.find((x) => x.brand.id === drillBrand);
          if (!s) return null;
          return (
            <BrandDrillDown
              brand={s.brand}
              agents={s.agents}
              conversionRate={s.rate}
              speedMs={s.speedMs}
              adminPassword={password}
              initialPreset={metaPreset}
              onClose={() => setDrillBrand(null)}
            />
          );
        })()}

      {/* Lead timeline (from the Activity table) */}
      {openLead && (
        <LeadTimeline lead={openLead} onClose={() => setOpenLead(null)} />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-xl bg-gray-900 px-5 py-3 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
    </main>
  );
}

// Full lead timeline for the admin Activity table — what's going on, the
// booked appointment, agent notes, whether it went into the marketing funnel,
// and the complete stage history.
function LeadTimeline({
  lead,
  onClose,
}: {
  lead: ActivityLead;
  onClose: () => void;
}) {
  const b = brandById(lead.brandId);
  const inFunnel = lead.stage === "nurture";
  const isLost = lead.stage === "lost";
  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-gray-900/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold">{lead.leadName}</h2>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-500">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: b?.accent }}
              />
              {b?.shortName ?? lead.brandId} · {lead.agentName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"
            aria-label="Close"
          >
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {/* Status + funnel banner */}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${LEAD_STAGE_STYLE[lead.stage] ?? "bg-gray-100 text-gray-500"}`}
          >
            {LEAD_STAGE_LABEL[lead.stage] ?? lead.stage}
          </span>
          <span className="rounded-full bg-gray-50 px-2.5 py-0.5 text-xs capitalize text-gray-500">
            {lead.source}
          </span>
        </div>

        {(inFunnel || isLost) && (
          <div
            className={`mt-4 rounded-2xl border p-4 text-sm ${
              inFunnel
                ? "border-purple-200 bg-purple-50 text-purple-700"
                : "border-gray-200 bg-gray-50 text-gray-600"
            }`}
          >
            {inFunnel ? (
              <>
                ✓ <strong>Sent into the marketing funnel.</strong> This lead was
                marked lost but added to nurture — it&apos;ll be worked through
                marketing rather than dropped.
              </>
            ) : (
              <>
                <strong>Lost — not in the marketing funnel.</strong> Marked lost
                and not added to nurture.
              </>
            )}
          </div>
        )}

        {lead.appointmentAt && (
          <div className="mt-4 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
            📅 Appointment booked for{" "}
            <strong>
              {new Date(lead.appointmentAt).toLocaleString("en-GB", {
                weekday: "short",
                day: "numeric",
                month: "long",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </strong>
          </div>
        )}

        {/* Agent notes */}
        {lead.notes.length > 0 && (
          <div className="mt-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
              Notes
            </p>
            <div className="mt-3 space-y-2">
              {[...lead.notes].reverse().map((n, i) => (
                <div
                  key={i}
                  className="rounded-xl bg-gray-50 p-3 text-sm text-gray-700"
                >
                  <p>{n.text}</p>
                  <p className="mt-1 text-xs text-gray-400">
                    {new Date(n.at).toLocaleString("en-GB")}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stage history */}
        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
            History
          </p>
          <ol className="mt-3 space-y-3">
            <li className="flex gap-3 text-sm">
              <span
                className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: b?.accent ?? "#111827" }}
              />
              <div>
                <p className="text-gray-700">Lead received</p>
                <p className="text-xs text-gray-400">
                  {new Date(lead.receivedAt).toLocaleString("en-GB")}
                </p>
              </div>
            </li>
            {lead.history
              .filter((h) => h.stage !== "new")
              .map((h, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span
                    className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: b?.accent ?? "#111827" }}
                  />
                  <div>
                    <p className="text-gray-700">
                      {LEAD_STAGE_LABEL[h.stage] ?? h.stage}
                    </p>
                    <p className="text-xs text-gray-400">
                      {new Date(h.at).toLocaleString("en-GB")}
                    </p>
                  </div>
                </li>
              ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

// Per-brand drill-down: live Meta stats + best-performing ads for a chosen
// date range, plus the portal's agents / conversion / speed-to-lead.
function BrandDrillDown({
  brand,
  agents,
  conversionRate,
  speedMs,
  adminPassword,
  initialPreset,
  onClose,
}: {
  brand: Brand;
  agents: number;
  conversionRate: number | null;
  speedMs: number | null;
  adminPassword: string;
  initialPreset: string;
  onClose: () => void;
}) {
  const [preset, setPreset] = useState(initialPreset);
  const [data, setData] = useState<{ snapshot: MetaSnapshot; ads: AdRow[] } | null>(
    null
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch(`/api/admin/meta/brand?brand=${brand.id}&preset=${preset}`, {
      headers: { Authorization: `Bearer ${adminPassword}` },
    })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (cancelled) return;
        if (!ok) {
          setError(j.error ?? "Failed to load");
          setData(null);
        } else {
          setData(j);
        }
      })
      .catch(() => !cancelled && setError("Network error"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [brand.id, preset, adminPassword]);

  const snap = data?.snapshot;
  const ads = data?.ads ?? [];
  const stats = snap
    ? [
        {
          label: "Spend",
          value: `£${snap.spend.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`,
        },
        { label: "Leads", value: String(snap.leads) },
        {
          label: "Cost / lead",
          value: snap.costPerLead === null ? "—" : `£${snap.costPerLead.toFixed(2)}`,
        },
        { label: "Clicks", value: snap.clicks.toLocaleString("en-GB") },
        { label: "Impressions", value: snap.impressions.toLocaleString("en-GB") },
        { label: "Agents", value: String(agents) },
        {
          label: "Conversion",
          value: conversionRate === null ? "—" : `${Math.round(conversionRate * 100)}%`,
        },
        {
          label: "Speed to lead",
          value: speedMs === null ? "—" : fmtDuration(speedMs),
        },
      ]
    : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-gray-900/50 p-6"
      onClick={onClose}
    >
      <div
        className="my-auto w-full max-w-3xl rounded-3xl bg-white p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <BrandMark name={brand.name} accent={brand.accent} logo={brand.logo} size={34} />
            <div>
              <h2 className="text-lg font-semibold">{brand.name}</h2>
              <p className="text-xs text-gray-400">Live from Meta · portal funnel</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {/* Date range */}
        <div className="mt-4 flex items-center gap-1 rounded-xl border border-gray-200 bg-white p-1">
          {DATE_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPreset(p.id)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                preset === p.id ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-50"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        ) : loading ? (
          <div className="mt-6 py-10 text-center text-sm text-gray-400">Loading…</div>
        ) : (
          <>
            {/* Stats */}
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {stats.map((st) => (
                <div key={st.label} className="rounded-xl border border-gray-100 p-3">
                  <p className="text-xs text-gray-400">{st.label}</p>
                  <p className="mt-0.5 text-lg font-semibold">{st.value}</p>
                </div>
              ))}
            </div>

            {/* Best-performing ads */}
            <h3 className="mt-6 text-sm font-semibold">What&apos;s working — top ads</h3>
            {ads.length === 0 ? (
              <p className="mt-2 text-sm text-gray-400">
                No ad-level data for this range.
              </p>
            ) : (
              <div className="mt-2 overflow-x-auto rounded-2xl border border-gray-200">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Ad</th>
                      <th className="px-4 py-2.5 font-medium">Leads</th>
                      <th className="px-4 py-2.5 font-medium">Spend</th>
                      <th className="px-4 py-2.5 font-medium">Cost / lead</th>
                      <th className="px-4 py-2.5 font-medium">Clicks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {ads.slice(0, 15).map((a, i) => (
                      <tr key={i}>
                        <td className="max-w-[240px] truncate px-4 py-2.5 font-medium">
                          {a.adName}
                        </td>
                        <td className="px-4 py-2.5">{a.leads}</td>
                        <td className="px-4 py-2.5">
                          £{a.spend.toLocaleString("en-GB", { maximumFractionDigits: 0 })}
                        </td>
                        <td className="px-4 py-2.5">
                          {a.cpl === null ? "—" : `£${a.cpl.toFixed(2)}`}
                        </td>
                        <td className="px-4 py-2.5">{a.clicks.toLocaleString("en-GB")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
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
