"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BRANDS, brandById, type Brand } from "@/lib/brands";
import Collapse from "@/components/Collapse";
import { packageById, PACKAGES, type AdPackage } from "@/lib/packages";
import { stageLabel } from "@/lib/onboarding";
import BrandMark from "@/components/BrandMark";
import AgentProfile from "@/components/AgentProfile";
import AccountImport from "@/components/AccountImport";
import TleProInvite from "@/components/TleProInvite";
import AdReconciliation from "@/components/AdReconciliation";
import EmailTest from "@/components/EmailTest";
import WhatsAppTemplate from "@/components/WhatsAppTemplate";
import PasswordInput from "@/components/PasswordInput";
import type { UserProfile, Referral } from "@/lib/types";
import ICONS, { SocialIcon } from "@/components/SocialIcons";

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

interface RexStatus {
  configured: boolean;
  ok: boolean;
  accounts?: Array<{ id: string; name: string | null }>;
  error?: string;
}

type Tab =
  | "overview"
  | "activity"
  | "referrals"
  | "crm"
  | "performance"
  | "connections"
  | "invite";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10" },
  { id: "activity", label: "Activity", icon: "M3 12h4l3 8 4-16 3 8h4" },
  {
    id: "referrals",
    label: "Referrals",
    icon: "M8 7h12m0 0l-4-4m4 4l-4 4M16 17H4m0 0l4 4m-4-4l4-4",
  },
  {
    id: "crm",
    label: "CRM",
    icon: "M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4z",
  },
  { id: "performance", label: "Performance", icon: "M3 17l6-6 4 4 8-8M21 7v6M21 7h-6" },
  // TEMPORARY — the TLE V1 launch tab. Remove once everyone's on the platform.
  {
    id: "invite",
    label: "Invite",
    icon: "M3 8l9 6 9-6M3 8v8a1 1 0 001 1h16a1 1 0 001-1V8M3 8l9-5 9 5",
  },
  {
    id: "connections",
    label: "Connections",
    icon: "M13.5 10.5 21 3m0 0h-5m5 0v5M10.5 13.5 3 21m0 0h5m-5 0v-5",
  },
];

// Chrome geometry (px) — the same wrap-around L-shape the customer portal uses.
const SIDEBAR_W = 240;
const TOPBAR_H = 64;
const SWOOP = 22;

// One seamless white L-shape (sidebar + top bar) drawn with a clip-path so
// there's no seam where the two arms meet — the concave swoop is part of the
// path. Neutral (no brand colour) for the admin section.
function ChromeSurface({ vw, vh }: { vw: number; vh: number }) {
  const sw = SIDEBAR_W;
  const th = TOPBAR_H;
  const r = SWOOP;
  const d =
    `M0 0 L${vw} 0 L${vw} ${th} L${sw + r} ${th} ` +
    `A${r} ${r} 0 0 0 ${sw} ${th + r} L${sw} ${vh} L0 ${vh} Z`;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-20 bg-white"
      style={{
        clipPath: `path('${d}')`,
        WebkitClipPath: `path('${d}')`,
        filter:
          "drop-shadow(3px 0 12px rgba(0,0,0,0.05)) drop-shadow(0 4px 12px rgba(0,0,0,0.05))",
      }}
    />
  );
}

const REFERRAL_STATUS_STYLE: Record<Referral["status"], string> = {
  pending: "bg-amber-50 text-amber-600",
  accepted: "bg-blue-50 text-blue-600",
  converted: "bg-green-50 text-green-600",
  paid: "bg-gray-900 text-white",
  declined: "bg-gray-100 text-gray-500",
  lost: "bg-gray-100 text-gray-500",
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
  history: { stage: string; at: string; label?: string }[];
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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // System mailbox (leads@) — the address the platform itself sends from.
  const [mailbox, setMailbox] = useState<{
    connected: boolean;
    email?: string;
    connectedAt?: string;
    microsoftConfigured?: boolean;
  } | null>(null);
  const [mailboxBusy, setMailboxBusy] = useState(false);
  const [mailboxError, setMailboxError] = useState("");
  const [authed, setAuthed] = useState(false);
  // "super" → the full dashboard below; "md" → the stripped brand view.
  const [role, setRole] = useState<"super" | "md" | null>(null);
  const [mdToken, setMdToken] = useState("");
  const [mdBrandId, setMdBrandId] = useState<string | null>(null);
  const [adminName, setAdminName] = useState("");
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
  // GoHighLevel nurture funnel status, per brand (each has its own sub-account).
  const [ghl, setGhl] = useState<
    Record<string, { configured: boolean; ok: boolean; error?: string }>
  >({});
  const [ghlOpen, setGhlOpen] = useState(false);
  const connectedGhl = BRANDS.filter((b) => ghl[b.id]?.ok).length;
  const [rex, setRex] = useState<RexStatus | null>(null);
  const [whatsapp, setWhatsapp] = useState<{
    configured: boolean;
    ok?: boolean;
    number?: string;
    name?: string;
    verified?: boolean;
    error?: string;
  } | null>(null);
  const [waMobile, setWaMobile] = useState("");
  const [waSending, setWaSending] = useState(false);
  const [waResult, setWaResult] = useState("");
  const [waError, setWaError] = useState("");
  const [rexTesting, setRexTesting] = useState(false);
  const [rexTestResult, setRexTestResult] = useState("");
  const [rexTestError, setRexTestError] = useState("");
  const [rexDescribeModelName, setRexDescribeModelName] = useState("Contacts");
  const [rexDescribing, setRexDescribing] = useState(false);
  const [rexDescribeResult, setRexDescribeResult] = useState("");
  const [rexDescribeError, setRexDescribeError] = useState("");
  const [rexWebhookEvents, setRexWebhookEvents] = useState<
    Array<{ id: string; receivedAt: string; body: unknown }>
  >([]);
  const [rexWebhookLoading, setRexWebhookLoading] = useState(false);
  const [rexSearchName, setRexSearchName] = useState("");
  const [rexSearching, setRexSearching] = useState(false);
  const [rexSearchResult, setRexSearchResult] = useState("");
  const [rexSearchError, setRexSearchError] = useState("");
  // Which brand's configured Rex account the tools below query — each brand
  // can have its own REX_ACCOUNT_<BRAND> override, so this matters.
  const [rexBrand, setRexBrand] = useState("lettings");
  const [rexUsersLoading, setRexUsersLoading] = useState(false);
  const [rexUsersResult, setRexUsersResult] = useState("");
  const [rexUsersError, setRexUsersError] = useState("");
  const [metaPreset, setMetaPreset] = useState<string>("last_30d");
  const [drillBrand, setDrillBrand] = useState<string | null>(null);
  const [activity, setActivity] = useState<ActivityData | null>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  // "Forgot password" asks waiting on a temporary password from the team.
  const [pwRequests, setPwRequests] = useState<
    {
      email: string;
      createdAt: string;
      userId: string | null;
      name: string | null;
      brandId: string | null;
    }[]
  >([]);
  const [selected, setSelected] = useState<FeedbackItem | null>(null);
  const [openLead, setOpenLead] = useState<ActivityLead | null>(null);
  const [nudging, setNudging] = useState<string | null>(null);
  const [toast, setToast] = useState("");

  // CRM view state
  const [selectedAgent, setSelectedAgent] = useState<UserProfile | null>(null);
  const [crmSort, setCrmSort] = useState<"recent" | "oldest" | "payHigh" | "payLow">(
    "recent"
  );
  const [crmPackage, setCrmPackage] = useState<"all" | AdPackage["id"]>("all");
  const [crmSearch, setCrmSearch] = useState("");
  const [vp, setVp] = useState({ w: 0, h: 0 });

  // Track the viewport so the chrome L-shape (a clip-path) can be sized to it.
  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    on();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);

  async function loadMailbox(pass: string) {
    try {
      const res = await fetch("/api/admin/mailbox", {
        headers: { Authorization: `Bearer ${pass}` },
      });
      if (res.ok) setMailbox(await res.json());
    } catch {
      /* non-fatal: the rest of the admin page still works */
    }
  }

  async function mailboxAction(action: "start" | "disconnect") {
    if (mailboxBusy) return;
    setMailboxError("");
    setMailboxBusy(true);
    try {
      const res = await fetch("/api/admin/mailbox", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${password}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMailboxError(data?.error ?? "Something went wrong.");
        setMailboxBusy(false);
        return;
      }
      if (action === "start" && data.url) {
        // The nonce cookie is set by that response; navigate to consent.
        window.location.href = data.url as string;
        return;
      }
      await loadMailbox(password);
    } catch {
      setMailboxError("Couldn't reach the server.");
    }
    setMailboxBusy(false);
  }

  async function loadData(pass: string): Promise<boolean> {
    const headers = { Authorization: `Bearer ${pass}` };
    loadMailbox(pass);
    const [fb, us, ev, ls, mt, li, at, ac, rf, rx, pw] = await Promise.all([
      fetch("/api/feedback", { headers }),
      fetch("/api/admin/users", { headers }),
      fetch("/api/track", { headers }),
      fetch("/api/admin/leads-summary", { headers }),
      fetch("/api/admin/meta", { headers }),
      fetch("/api/admin/linkedin", { headers }),
      fetch("/api/admin/atlas", { headers }),
      fetch("/api/admin/activity", { headers }),
      fetch("/api/admin/referrals", { headers }),
      fetch("/api/health?rex=1&whatsapp=1", { headers }),
      fetch("/api/admin/password-requests", { headers }),
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
    setPwRequests(pw.ok ? (await pw.json()).requests ?? [] : []);
    // Each brand has its own GoHighLevel sub-account, so check them one by one.
    // An unconfigured brand answers instantly without touching GHL.
    Promise.all(
      BRANDS.map(async (b) => {
        try {
          const r = await fetch(`/api/admin/ghl?brand=${b.id}`, { headers });
          return [b.id, r.ok ? await r.json() : { configured: false, ok: false }] as const;
        } catch {
          return [b.id, { configured: false, ok: false }] as const;
        }
      })
    ).then((entries) => setGhl(Object.fromEntries(entries)));
    if (rx.ok) {
      const health = await rx.json();
      setRex(health.rex ?? null);
      setWhatsapp(health.whatsapp ?? null);
    } else {
      setRex(null);
      setWhatsapp(null);
    }
    return true;
  }

  // Fires the real new_lead template at a chosen number — end-to-end proof.
  async function sendWhatsAppTestMsg() {
    const mobile = waMobile.trim();
    if (!mobile) return;
    setWaSending(true);
    setWaResult("");
    setWaError("");
    const res = await fetch("/api/admin/whatsapp/test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${password}`,
      },
      body: JSON.stringify({ mobile }),
    });
    const data = await res.json().catch(() => ({}));
    setWaSending(false);
    if (data.ok) {
      // Name the template so this proves the right thing: "via new_lead_link"
      // means the deep-link button went out, not just any message.
      setWaResult(
        `Sent ✓ via ${data.template ?? "template"}${
          data.dynamic ? " (deep-link button)" : ""
        } — check WhatsApp on ${mobile}.`
      );
    } else if (data.reason === "not_configured") {
      setWaError("WHATSAPP_TOKEN / WHATSAPP_PHONE_ID aren't set in Railway.");
    } else if (data.reason === "bad_number") {
      setWaError("That doesn't look like a valid UK mobile.");
    } else {
      setWaError(
        (data.template ? `${data.template}: ` : "") +
          (data.reason ?? data.error ?? "Send failed — try again.")
      );
    }
  }

  // One-off probe: pushes a synthetic test lead into Rex via the connected
  // account, using this session's own admin password — no need to share it.
  async function testRexPush() {
    setRexTesting(true);
    setRexTestResult("");
    setRexTestError("");
    const res = await fetch("/api/admin/rex/test-push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${password}`,
      },
      body: JSON.stringify({ brandId: rexBrand }),
    });
    const data = await res.json().catch(() => ({}));
    setRexTesting(false);
    if (!res.ok || !data.ok) {
      setRexTestError(data.error ?? "Test push failed");
      return;
    }
    setRexTestResult(
      `✓ Created contact ${data.result.contactId}${
        data.result.contactAlreadyExisted ? " (already existed)" : ""
      } and lead ${data.result.leadId} in account ${data.accountId}.`
    );
  }

  // Asks Rex what fields a model actually accepts — ground truth for fixing
  // the create-contact/create-lead mapping instead of guessing again.
  async function describeRexModel() {
    setRexDescribing(true);
    setRexDescribeResult("");
    setRexDescribeError("");
    const res = await fetch("/api/admin/rex/describe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${password}`,
      },
      body: JSON.stringify({ model: rexDescribeModelName, brandId: rexBrand }),
    });
    const data = await res.json().catch(() => ({}));
    setRexDescribing(false);
    if (!res.ok || !data.ok) {
      setRexDescribeError(data.error ?? "Describe failed");
      return;
    }
    setRexDescribeResult(JSON.stringify(data.result, null, 2));
  }

  // Lists the users on the selected brand's Rex account — how you find each
  // agent's Rex user id to paste into their profile.
  async function listRexUsers() {
    setRexUsersLoading(true);
    setRexUsersResult("");
    setRexUsersError("");
    const res = await fetch("/api/admin/rex/users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${password}`,
      },
      body: JSON.stringify({ brandId: rexBrand }),
    });
    const data = await res.json().catch(() => ({}));
    setRexUsersLoading(false);
    if (!res.ok || !data.ok) {
      setRexUsersError(data.error ?? "Couldn't list Rex users");
      return;
    }
    setRexUsersResult(JSON.stringify(data.result, null, 2));
  }

  // Recent raw Rex webhook deliveries — lets us read the real event shape
  // once it's registered, instead of guessing at it.
  async function loadRexWebhookEvents() {
    setRexWebhookLoading(true);
    const res = await fetch("/api/admin/rex/webhook-log", {
      headers: { Authorization: `Bearer ${password}` },
    });
    const data = await res.json().catch(() => ({}));
    setRexWebhookLoading(false);
    setRexWebhookEvents(data.events ?? []);
  }

  // Ground-truth search against Rex's own API — bypasses whatever the Rex
  // web UI's search box does, to confirm whether a pushed contact actually
  // exists. Blank name lists the most recently created contacts instead.
  async function searchRexContacts() {
    setRexSearching(true);
    setRexSearchResult("");
    setRexSearchError("");
    const res = await fetch("/api/admin/rex/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${password}`,
      },
      body: JSON.stringify({ name: rexSearchName.trim(), brandId: rexBrand }),
    });
    const data = await res.json().catch(() => ({}));
    setRexSearching(false);
    if (!res.ok || !data.ok) {
      setRexSearchError(data.error ?? "Search failed");
      return;
    }
    setRexSearchResult(JSON.stringify(data.result, null, 2));
  }

  // Save a brand's Meta ad account + page (Option B — no redeploy) and refresh.
  async function saveBrandMeta(
    brandId: string,
    adAccountId: string,
    pageId?: string
  ) {
    await fetch("/api/admin/meta", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${password}`,
      },
      body: JSON.stringify({ brandId, adAccountId, pageId }),
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

  // Drop a deleted agent out of the list once their profile is removed.
  function applyAgentDelete(id: string) {
    setUsers((prev) => prev.filter((x) => x.id !== id));
  }

  async function signIn() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Sign in failed.");
        return;
      }
      if (data.role === "super") {
        const ok = await loadData(data.token).catch(() => false);
        if (!ok) {
          setError("Couldn't load the admin data — try again.");
          return;
        }
        setPassword(data.token);
        setRole("super");
        setAuthed(true);
        sessionStorage.setItem(
          "teg_admin_v2",
          JSON.stringify({ token: data.token, role: "super", email: data.email })
        );
      } else {
        setMdToken(data.token);
        setMdBrandId(data.brandId);
        setAdminName(data.name ?? "");
        setRole("md");
        setAuthed(true);
        sessionStorage.setItem(
          "teg_admin_v2",
          JSON.stringify({
            token: data.token,
            role: "md",
            brandId: data.brandId,
            name: data.name,
            email: data.email,
          })
        );
      }
    } finally {
      setLoading(false);
    }
  }

  function signOut() {
    sessionStorage.removeItem("teg_admin_v2");
    setAuthed(false);
    setRole(null);
    setPassword("");
    setMdToken("");
    setMdBrandId(null);
  }

  useEffect(() => {
    const raw = sessionStorage.getItem("teg_admin_v2");
    if (!raw) return;
    try {
      const s = JSON.parse(raw) as {
        token: string;
        role: "super" | "md";
        brandId?: string;
        name?: string;
      };
      if (s.role === "super") {
        loadData(s.token).then((ok) => {
          if (ok) {
            setPassword(s.token);
            setRole("super");
            setAuthed(true);
          }
        });
      } else {
        setMdToken(s.token);
        setMdBrandId(s.brandId ?? null);
        setAdminName(s.name ?? "");
        setRole("md");
        setAuthed(true);
      }
    } catch {
      /* corrupt session — ignore */
    }
  }, []);

  // Filtered + sorted agents for the CRM table.
  const crmUsers = useMemo(() => {
    const q = crmSearch.trim().toLowerCase();
    let list = users.filter((u) => {
      // Compare through packageById so accounts still stored under the old
      // "scale" id are found by the "Accelerate" filter.
      if (crmPackage !== "all" && packageById(u.packageId)?.id !== crmPackage)
        return false;
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
      <main className="flex min-h-screen items-center justify-center bg-white px-6">
        <div className="w-full max-w-sm">
          <div className="mb-10 flex items-center justify-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-900 text-sm font-bold text-white">
              E
            </span>
            <span className="text-sm font-semibold">The Experts Group</span>
          </div>
          <h1 className="text-center text-2xl font-semibold tracking-tight">
            Admin sign in
          </h1>
          <p className="mt-2 text-center text-sm text-gray-500">
            Sign in with your work email
          </p>
          <div className="mt-8 space-y-3">
            <input
              autoFocus
              type="email"
              className="w-full rounded-xl border border-gray-200 px-4 py-3 outline-none transition focus:border-gray-900 focus:ring-4 focus:ring-gray-100"
              placeholder="you@theexpertsgroup.co.uk"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && signIn()}
            />
            <PasswordInput
              className="w-full rounded-xl border border-gray-200 px-4 py-3 outline-none transition focus:border-gray-900 focus:ring-4 focus:ring-gray-100"
              placeholder="Password"
              value={password}
              onChange={setPassword}
              onEnter={signIn}
            />
          </div>
          {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
          <button
            onClick={signIn}
            disabled={loading || !password || !email}
            className="mt-4 w-full rounded-xl bg-gray-900 py-3 text-sm font-medium text-white transition hover:bg-gray-700 disabled:opacity-50"
          >
            {loading ? "Checking…" : "Sign in"}
          </button>
          <Link
            href="/"
            className="mt-6 block text-center text-sm text-gray-500 hover:text-gray-900"
          >
            ← Back to site
          </Link>
        </div>
      </main>
    );
  }

  // Managing-director view — a clean, brand-scoped overview. No connections,
  // no other businesses.
  if (role === "md" && mdBrandId) {
    return (
      <MdDashboard
        token={mdToken}
        brandId={mdBrandId}
        name={adminName}
        onSignOut={signOut}
      />
    );
  }

  return (
    <div
      className="relative min-h-screen isolate"
      style={{ background: "#f6f6f7" }}
    >
      {/* One seamless white chrome surface (sidebar + top bar + swoop) —
          mirrors the customer portal, but neutral (no brand colour). */}
      {vp.w > 0 && <ChromeSurface vw={vp.w} vh={vp.h} />}

      {/* ── Sidebar (transparent — the chrome provides the white surface) ── */}
      <aside className="fixed inset-y-0 left-0 z-30 flex w-60 flex-col">
        <div className="px-5 pt-14">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-900 text-sm font-bold text-white">
              E
            </span>
            <div className="leading-tight">
              <p className="text-sm font-semibold">The Experts Group</p>
              <p className="text-[11px] uppercase tracking-wide text-gray-400">
                Admin
              </p>
            </div>
          </div>
        </div>

        <nav className="mt-10 flex-1 space-y-0.5 px-3">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-gray-100 text-gray-900"
                    : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  viewBox="0 0 24 24"
                >
                  <path d={t.icon} />
                </svg>
                {t.label}
              </button>
            );
          })}
        </nav>

        <div className="p-4">
          <button
            onClick={signOut}
            className="w-full rounded-lg border border-gray-200 py-1.5 text-xs font-medium text-gray-500 transition hover:bg-gray-50 hover:text-gray-900"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Top bar (transparent) ── */}
      <header className="fixed left-[240px] right-0 top-0 z-40 flex h-16 items-center justify-between gap-3 px-8">
        <h1 className="text-lg font-semibold tracking-tight">
          {TABS.find((t) => t.id === tab)?.label}
        </h1>
        <div className="flex items-center gap-3 text-sm">
          <button
            onClick={() => loadData(password)}
            className="rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2 font-medium text-gray-500 transition hover:text-gray-900"
          >
            Refresh
          </button>
          <Link
            href="/"
            className="rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2 font-medium text-gray-500 transition hover:text-gray-900"
          >
            View site
          </Link>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="ml-[240px] px-8 pb-10 pt-[104px]">
        <div className="mx-auto max-w-6xl">
        {/* ═══ OVERVIEW ═══ */}
        {tab === "overview" && (
          <>
            {(() => {
              // No customer sign-off any more — review just means "creatives
              // uploaded, we set them live when ready".
              const inReview = users.filter(
                (u) => u.onboardingStage === "review"
              );
              if (inReview.length === 0) return null;
              return (
                <div className="mb-6 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
                  👀 <strong>{inReview.length}</strong> campaign
                  {inReview.length === 1 ? "" : "s"} in review:{" "}
                  <span className="font-medium">
                    {inReview.map((u) => u.name).join(", ")}
                  </span>
                  . Open their record → move to <em>Ads live</em> when ready.
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

            {/* One-time launch import — pre-provision referrals-only accounts
                for the whole group from a CSV. Super admin only. */}
            {role === "super" && <AccountImport pass={password} />}

            {/* Locked out — "forgot password" asks from the login page. There's
                no reset email yet, so the team issues a temporary password from
                the agent's own record. */}
            {pwRequests.length > 0 && (
              <section className="mt-10 rounded-2xl border border-amber-200 bg-amber-50 p-5">
                <h2 className="text-sm font-semibold text-amber-900">
                  Locked out — waiting on a password{" "}
                  <span className="font-normal text-amber-700/70">
                    {pwRequests.length}
                  </span>
                </h2>
                <p className="mt-0.5 text-xs text-amber-800/70">
                  Open the agent, hit <strong>Reset password</strong>, and pass
                  them the temporary one — then clear it here.
                </p>
                <ul className="mt-3 space-y-2">
                  {pwRequests.map((r) => (
                    <li
                      key={r.email}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white px-3.5 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-900">
                          {r.name ?? r.email}
                        </p>
                        <p className="truncate text-xs text-gray-400">
                          {r.name ? `${r.email} · ` : ""}
                          asked {new Date(r.createdAt).toLocaleString("en-GB")}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {r.userId && (
                          <button
                            onClick={() => {
                              const u = users.find((x) => x.id === r.userId);
                              if (u) setSelectedAgent(u);
                            }}
                            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                          >
                            Open agent
                          </button>
                        )}
                        <button
                          onClick={async () => {
                            await fetch("/api/admin/password-requests", {
                              method: "POST",
                              headers: {
                                "Content-Type": "application/json",
                                Authorization: `Bearer ${password}`,
                              },
                              body: JSON.stringify({ email: r.email }),
                            });
                            setPwRequests((prev) =>
                              prev.filter((x) => x.email !== r.email)
                            );
                          }}
                          className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700"
                        >
                          Done
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

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
                      <th className="px-5 py-3 font-medium">Email connected</th>
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
                          {/* Same rule as the email gate: connected only
                              counts when it's THEIR OWN address — a colleague's
                              mailbox proves employment, not identity. */}
                          <td className="px-5 py-3">
                            {u.msEmail &&
                            u.msEmail.trim().toLowerCase() ===
                              u.email.trim().toLowerCase() ? (
                              <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
                                Connected ✓
                              </span>
                            ) : u.msEmail ? (
                              <span
                                className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800"
                                title={`Connected as ${u.msEmail} — not this account's own address`}
                              >
                                Different mailbox
                              </span>
                            ) : (
                              <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-400">
                                Not yet
                              </span>
                            )}
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
        {/* TEMPORARY — the TLE V1 launch tab. Remove once everyone's on. */}
        {tab === "invite" && (
          <div className="space-y-6">
            <AdReconciliation pass={password} />
            <TleProInvite pass={password} />
          </div>
        )}

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
            {/* System mailbox — the address the platform sends from. Invite
                emails, password resets and admin alerts all depend on it. */}
            <section className="mb-10">
              <h2 className="text-lg font-semibold">
                System mailbox (leads@)
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                The address Launch Pad sends from: invite emails, password
                resets and admin notifications. Separate from an agent&apos;s
                own connected mailbox, which is only used to email their leads.
              </p>

              {mailbox?.connected ? (
                <div className="mt-4 rounded-2xl border border-green-200 bg-green-50 p-5">
                  <p className="text-sm font-medium text-green-900">
                    Connected — {mailbox.email}
                  </p>
                  {mailbox.connectedAt && (
                    <p className="mt-0.5 text-xs text-green-800/70">
                      Since{" "}
                      {new Date(mailbox.connectedAt).toLocaleDateString(
                        "en-GB",
                        { day: "numeric", month: "long", year: "numeric" }
                      )}
                    </p>
                  )}
                  <button
                    onClick={() => mailboxAction("disconnect")}
                    disabled={mailboxBusy}
                    className="mt-3 rounded-lg border border-green-300 bg-white px-4 py-2 text-sm font-medium text-green-900 hover:bg-green-100 disabled:opacity-50"
                  >
                    {mailboxBusy ? "Working…" : "Disconnect"}
                  </button>
                </div>
              ) : mailbox?.microsoftConfigured === false ? (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-700">
                  <p className="font-medium">Microsoft isn&apos;t configured.</p>
                  <p className="mt-1">
                    Set <code>AZURE_CLIENT_ID</code> and{" "}
                    <code>AZURE_CLIENT_SECRET</code> in Railway, then reload.
                  </p>
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-5">
                  <p className="text-sm font-medium text-amber-900">
                    Not connected — nothing can be emailed yet.
                  </p>
                  <p className="mt-1 text-sm text-amber-800/80">
                    Sign in as leads@theexpertsgroup.co.uk to authorise it.
                    You&apos;ll be asked to grant send-on-behalf permission.
                  </p>
                  <button
                    onClick={() => mailboxAction("start")}
                    disabled={mailboxBusy}
                    className="mt-3 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
                  >
                    {mailboxBusy ? "Opening…" : "Connect with Microsoft"}
                  </button>
                </div>
              )}
              {mailboxError && (
                <p className="mt-3 text-sm text-red-600">{mailboxError}</p>
              )}
            </section>

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
                user first). Add the <strong>Page ID</strong> too to unlock
                "Find older leads" on each agent's CRM record. Saves instantly
                — no redeploy. Clear a box to disconnect it.
              </p>
              <div className="mt-4 space-y-3">
                {BRANDS.map((b) => {
                  const res = meta?.results.find((r) => r.brandId === b.id);
                  const connected = !!res?.snapshot;
                  const err = res?.error;
                  const currentAcc = meta?.config?.[b.id]?.adAccountId ?? "";
                  const currentPage = meta?.config?.[b.id]?.pageId ?? "";
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
                            {currentPage && " · Page linked"}
                          </p>
                        </div>
                      </div>
                      <input
                        defaultValue={currentAcc}
                        placeholder="Ad Account ID (act_…)"
                        className="w-40 rounded-lg border border-gray-200 px-3 py-1.5 text-sm outline-none focus:border-gray-900"
                        id={`meta-acc-${b.id}`}
                      />
                      <input
                        defaultValue={currentPage}
                        placeholder="Page ID"
                        className="w-32 rounded-lg border border-gray-200 px-3 py-1.5 text-sm outline-none focus:border-gray-900"
                        id={`meta-page-${b.id}`}
                      />
                      <button
                        onClick={() => {
                          const acc = document.getElementById(
                            `meta-acc-${b.id}`
                          ) as HTMLInputElement | null;
                          const page = document.getElementById(
                            `meta-page-${b.id}`
                          ) as HTMLInputElement | null;
                          saveBrandMeta(
                            b.id,
                            acc?.value ?? "",
                            page?.value ?? ""
                          );
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

            {/* GoHighLevel — the nurture funnel for lost leads. Each brand has
                its own sub-account, so each needs its own token + location. */}
            <section className="mt-10">
              {/* Click to open — each brand has its own GHL sub-account, so the
                  detail is a per-brand list tucked behind the header. */}
              <button
                onClick={() => setGhlOpen((v) => !v)}
                className="flex w-full items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-5 py-4 text-left transition hover:bg-gray-50"
              >
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold">
                    GoHighLevel{" "}
                    <span className="text-sm font-normal text-gray-400">
                      nurture funnel
                    </span>
                  </h2>
                  <p className="mt-0.5 text-xs text-gray-400">
                    One sub-account per brand — open to see which are live.
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        connectedGhl === BRANDS.length
                          ? "bg-green-500"
                          : connectedGhl > 0
                            ? "bg-amber-400"
                            : "bg-gray-300"
                      }`}
                    />
                    {connectedGhl} of {BRANDS.length} connected
                  </span>
                  <svg
                    className={`h-4 w-4 text-gray-400 transition-transform duration-300 ${
                      ghlOpen ? "rotate-180" : ""
                    }`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
                  </svg>
                </div>
              </button>

              <Collapse open={ghlOpen}>
                <div className="pt-3">
                  <p className="max-w-2xl text-xs text-gray-500">
                    Only leads an agent sends to the marketing funnel after three
                    no-answers land here — they arrive tagged{" "}
                    <code className="rounded bg-gray-100 px-1">nurture</code> and{" "}
                    <code className="rounded bg-gray-100 px-1">
                      brand:&lt;id&gt;
                    </code>
                    . Leads are never pushed to GoHighLevel as a CRM.
                  </p>
                  <div className="mt-3 overflow-hidden rounded-2xl border border-gray-200 bg-white">
                    {BRANDS.map((b, i) => {
                      const s = ghl[b.id];
                      return (
                        <div
                          key={b.id}
                          className={`flex items-center gap-3 p-4 ${
                            i > 0 ? "border-t border-gray-100" : ""
                          }`}
                        >
                          <BrandMark
                            name={b.name}
                            accent={b.accent}
                            logo={b.logo}
                            size={30}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {b.name}
                            </p>
                            {/* A failing brand shows GoHighLevel's own words in
                                full — that message is the whole diagnosis, so
                                never truncate it. */}
                            <p
                              className={`mt-0.5 text-xs ${
                                s?.configured && !s.ok
                                  ? "text-red-600"
                                  : "text-gray-400"
                              }`}
                            >
                              {s?.ok
                                ? "Sending lost leads to this brand's funnel"
                                : s?.configured
                                  ? (s.error ?? "Connection failed")
                                  : `Add GHL_TOKEN_${b.id.toUpperCase()} + GHL_LOCATION_${b.id.toUpperCase()} in Railway`}
                            </p>
                            {s?.configured && !s.ok && (
                              <p className="mt-1 text-[11px] text-gray-400">
                                Each brand needs its own token, made inside{" "}
                                <span className="font-medium">its own</span>{" "}
                                sub-account — a token from another brand
                                can&apos;t reach this location.
                              </p>
                            )}
                          </div>
                          <span
                            className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                              s?.ok
                                ? "bg-green-50 text-green-700"
                                : s?.configured
                                  ? "bg-red-50 text-red-600"
                                  : "bg-gray-100 text-gray-400"
                            }`}
                          >
                            {s?.ok
                              ? "● Connected"
                              : s?.configured
                                ? "Failing"
                                : "Not set up"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Collapse>
            </section>

            {/* Rex CRM (Property / Lettings / Fine & Country / Auction) */}
            <section className="mt-10">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">Rex CRM</h2>
                {rex && (
                  <span className="flex items-center gap-1.5 text-xs text-gray-500">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${rex.ok ? "bg-green-500" : rex.configured ? "bg-red-500" : "bg-gray-300"}`}
                    />
                    {rex.ok
                      ? `Connected — ${rex.accounts?.length ?? 0} account${rex.accounts?.length === 1 ? "" : "s"} visible`
                      : rex.configured
                        ? (rex.error ?? "Connection failed")
                        : "Add REX_API_EMAIL/PASSWORD in Railway"}
                  </span>
                )}
              </div>
              <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-5">
                <p className="text-sm text-gray-600">
                  Property, Lettings, Fine &amp; Country and Auction push
                  converted leads into Rex (rexsoftware.com).
                </p>
                {rex?.accounts && rex.accounts.length > 0 && (
                  <ul className="mt-3 space-y-1 text-xs text-gray-500">
                    {rex.accounts.map((a) => (
                      <li key={a.id}>
                        · {a.name ?? "Unnamed account"}{" "}
                        <span className="text-gray-400">(id {a.id})</span>
                      </li>
                    ))}
                  </ul>
                )}

                {/* Every tool below queries THIS brand's configured Rex
                    account (REX_ACCOUNT_<BRAND>, falling back to
                    REX_ACCOUNT_ID) — brands can be on different accounts. */}
                <div className="mt-4 flex items-center gap-2 border-t border-gray-100 pt-4">
                  <label className="text-xs font-medium text-gray-500">
                    Tools below act as
                  </label>
                  <select
                    value={rexBrand}
                    onChange={(e) => setRexBrand(e.target.value)}
                    className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 outline-none focus:border-gray-900"
                  >
                    {["property", "lettings", "fineandcountry", "auction"].map(
                      (id) => (
                        <option key={id} value={id}>
                          {brandById(id)?.name ?? id}
                        </option>
                      )
                    )}
                  </select>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    onClick={testRexPush}
                    disabled={rexTesting || !rex?.ok}
                    className="rounded-lg bg-gray-900 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-gray-700 disabled:opacity-40"
                  >
                    {rexTesting ? "Pushing…" : "Test push a lead"}
                  </button>
                  <span className="text-xs text-gray-400">
                    Creates a throwaway test contact + lead in the connected
                    account (REX_ACCOUNT_ID) — safe to delete afterwards.
                  </span>
                </div>
                {rexTestResult && (
                  <p className="mt-3 text-sm font-medium text-green-700">
                    {rexTestResult}
                  </p>
                )}
                {rexTestError && (
                  <p className="mt-3 text-sm text-red-600">{rexTestError}</p>
                )}

                {/* Inspect Rex's own field list — ground truth instead of guessing */}
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4">
                  <select
                    value={rexDescribeModelName}
                    onChange={(e) => setRexDescribeModelName(e.target.value)}
                    className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 outline-none focus:border-gray-900"
                  >
                    <option value="Contacts">Contacts</option>
                    <option value="Leads">Leads</option>
                  </select>
                  <button
                    onClick={describeRexModel}
                    disabled={rexDescribing || !rex?.ok}
                    className="rounded-lg border border-gray-200 px-3.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                  >
                    {rexDescribing ? "Asking Rex…" : "Inspect fields"}
                  </button>
                  <span className="text-xs text-gray-400">
                    Asks Rex what this model actually accepts.
                  </span>
                </div>
                {rexDescribeError && (
                  <p className="mt-3 text-sm text-red-600">{rexDescribeError}</p>
                )}
                {rexDescribeResult && (
                  <pre className="mt-3 max-h-80 overflow-auto rounded-xl bg-gray-900 p-3.5 text-[11px] leading-relaxed text-green-300">
                    {rexDescribeResult}
                  </pre>
                )}

                {/* Search — ground truth for "did this contact actually land"
                    without relying on Rex's own web UI search */}
                <div className="mt-4 border-t border-gray-100 pt-4">
                  <p className="text-sm font-semibold">Find a contact</p>
                  <p className="mt-1 text-xs text-gray-500">
                    Searches Rex's API directly — bypasses whatever the Rex
                    web UI's search box does, so we can confirm a pushed
                    contact actually exists.
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input
                      value={rexSearchName}
                      onChange={(e) => setRexSearchName(e.target.value)}
                      placeholder="Name (blank = 10 most recent)"
                      className="w-56 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs outline-none focus:border-gray-900"
                      onKeyDown={(e) => e.key === "Enter" && searchRexContacts()}
                    />
                    <button
                      onClick={searchRexContacts}
                      disabled={rexSearching || !rex?.ok}
                      className="rounded-lg border border-gray-200 px-3.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                    >
                      {rexSearching ? "Searching…" : "Search"}
                    </button>
                  </div>
                  {rexSearchError && (
                    <p className="mt-3 text-sm text-red-600">{rexSearchError}</p>
                  )}
                  {rexSearchResult && (
                    <pre className="mt-3 max-h-80 overflow-auto rounded-xl bg-gray-900 p-3.5 text-[11px] leading-relaxed text-green-300">
                      {rexSearchResult}
                    </pre>
                  )}
                </div>

                {/* Rex users — find each agent's Rex user id, then paste it
                    into their CRM record so pushed leads land owned by them */}
                <div className="mt-4 border-t border-gray-100 pt-4">
                  <p className="text-sm font-semibold">Rex users</p>
                  <p className="mt-1 text-xs text-gray-500">
                    Lists the users on this brand&apos;s Rex account. Copy an
                    agent&apos;s user id into the <strong>Rex user ID</strong>{" "}
                    field on their CRM record — their pushed leads then show as
                    owned/assigned to them in Rex, not the shared API login.
                  </p>
                  <button
                    onClick={listRexUsers}
                    disabled={rexUsersLoading || !rex?.ok}
                    className="mt-2 rounded-lg border border-gray-200 px-3.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                  >
                    {rexUsersLoading ? "Asking Rex…" : "List Rex users"}
                  </button>
                  {rexUsersError && (
                    <p className="mt-3 text-sm text-red-600">{rexUsersError}</p>
                  )}
                  {rexUsersResult && (
                    <pre className="mt-3 max-h-80 overflow-auto rounded-xl bg-gray-900 p-3.5 text-[11px] leading-relaxed text-green-300">
                      {rexUsersResult}
                    </pre>
                  )}
                </div>

                {/* Webhook — tracks a lead's downstream progress inside Rex
                    (Appraisal booked, sale won, etc.) so referrals can mirror it */}
                <div className="mt-4 border-t border-gray-100 pt-4">
                  <p className="text-sm font-semibold">Webhook</p>
                  <p className="mt-1 text-xs text-gray-500">
                    Register this exact URL in Rex → Settings → Webhooks (needs
                    the "Manage Zapier and Webhooks" privilege), with{" "}
                    <code className="rounded bg-gray-100 px-1">
                      REX_WEBHOOK_SECRET
                    </code>{" "}
                    set in Railway to any random string:
                  </p>
                  <code className="mt-2 block break-all rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700">
                    {`${typeof window !== "undefined" ? window.location.origin : ""}/api/rex/webhook?token=YOUR_REX_WEBHOOK_SECRET`}
                  </code>
                  <div className="mt-3 flex items-center gap-3">
                    <button
                      onClick={loadRexWebhookEvents}
                      disabled={rexWebhookLoading}
                      className="rounded-lg border border-gray-200 px-3.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                    >
                      {rexWebhookLoading ? "Checking…" : "Check recent events"}
                    </button>
                    <span className="text-xs text-gray-400">
                      Shows the last events Rex has sent — useful to confirm
                      the webhook is firing and see its real payload shape.
                    </span>
                  </div>
                  {rexWebhookEvents.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      {rexWebhookEvents.map((e) => (
                        <details
                          key={e.id}
                          className="rounded-xl border border-gray-200 bg-white p-3"
                        >
                          <summary className="cursor-pointer text-xs font-medium text-gray-600">
                            {new Date(e.receivedAt).toLocaleString("en-GB")}
                          </summary>
                          <pre className="mt-2 max-h-60 overflow-auto rounded-lg bg-gray-900 p-3 text-[11px] leading-relaxed text-green-300">
                            {JSON.stringify(e.body, null, 2)}
                          </pre>
                        </details>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-gray-400">
                      No webhook events captured yet.
                    </p>
                  )}
                </div>
              </div>
            </section>

            <EmailTest pass={password} />

            {/* WhatsApp — new-lead alerts + cold-lead nudges to agents */}
            <section className="mt-10">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">WhatsApp alerts</h2>
                {whatsapp && (
                  <span className="flex items-center gap-1.5 text-xs text-gray-500">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        whatsapp.ok && whatsapp.verified
                          ? "bg-green-500"
                          : whatsapp.configured
                            ? "bg-amber-400"
                            : "bg-gray-300"
                      }`}
                    />
                    {whatsapp.ok
                      ? `${whatsapp.name ?? "Connected"} · ${whatsapp.number ?? ""}${whatsapp.verified ? " · verified" : " · unverified"}`
                      : whatsapp.configured
                        ? (whatsapp.error ?? "Connection failed")
                        : "Add WHATSAPP_TOKEN / WHATSAPP_PHONE_ID in Railway"}
                  </span>
                )}
              </div>
              <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-5">
                <p className="text-sm text-gray-600">
                  Agents get a WhatsApp the moment a lead lands, plus the
                  &ldquo;Send WhatsApp again&rdquo; nudge on cold leads. Both
                  use approved templates (<code>new_lead</code> /{" "}
                  <code>lead_reminder</code>).
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <input
                    value={waMobile}
                    onChange={(e) => setWaMobile(e.target.value)}
                    placeholder="07700 900000"
                    className="w-44 rounded-lg border border-gray-200 px-3 py-1.5 text-sm outline-none focus:border-gray-900"
                    onKeyDown={(e) => e.key === "Enter" && sendWhatsAppTestMsg()}
                  />
                  <button
                    onClick={sendWhatsAppTestMsg}
                    disabled={waSending || !waMobile.trim() || !whatsapp?.ok}
                    className="rounded-lg bg-[#25D366] px-3.5 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40"
                  >
                    {waSending ? "Sending…" : "Send test message"}
                  </button>
                  <span className="text-xs text-gray-400">
                    Fires the real new-lead template at that number.
                  </span>
                </div>
                {waResult && (
                  <p className="mt-3 text-sm font-medium text-green-700">
                    {waResult}
                  </p>
                )}
                {waError && (
                  <p className="mt-3 text-sm text-red-600">{waError}</p>
                )}
              </div>
            
              <WhatsAppTemplate pass={password} />
            </section>

            {/* Other systems */}
            <section className="mt-10">
              <h2 className="text-lg font-semibold">Systems</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {[
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
      </main>

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
          onLeadsImported={() => loadData(password)}
          onDeleted={applyAgentDelete}
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
    </div>
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
                      {h.label ?? LEAD_STAGE_LABEL[h.stage] ?? h.stage}
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

// ── Brand socials — organic followers + growth per brand ──────────────────
interface SocialPlatformDto {
  configured: boolean;
  followers: number | null;
  gained: number | null;
  handle: string | null;
  error?: string;
}
interface SocialDto {
  brandId: string;
  facebook: SocialPlatformDto;
  instagram: SocialPlatformDto;
}

function fmtCount(n: number | null): string {
  return n == null ? "—" : n.toLocaleString("en-GB");
}
function fmtGained(n: number | null): string {
  if (n == null) return "—";
  return `${n > 0 ? "+" : ""}${n.toLocaleString("en-GB")}`;
}

function PlatformCell({
  label,
  icon,
  data,
  windowLabel,
}: {
  label: string;
  icon: string;
  data: SocialPlatformDto;
  windowLabel: string;
}) {
  const gainedColor =
    data.gained == null
      ? "text-gray-400"
      : data.gained > 0
        ? "text-green-600"
        : data.gained < 0
          ? "text-red-600"
          : "text-gray-500";
  return (
    <div className="flex items-center gap-4 rounded-xl border border-gray-100 p-4">
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-900 text-white"
        aria-hidden
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
          <path d={icon} />
        </svg>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <p className="text-sm font-medium">{label}</p>
          {data.handle ? (
            <p className="truncate text-xs text-gray-400">{data.handle}</p>
          ) : null}
        </div>
        {!data.configured ? (
          <p className="mt-0.5 text-xs text-amber-600">Not linked</p>
        ) : data.error || data.followers == null ? (
          <p className="mt-0.5 text-xs text-amber-600">Page needs access</p>
        ) : (
          <div className="mt-1 flex items-baseline gap-4">
            <span className="text-2xl font-semibold tracking-tight">
              {fmtCount(data.followers)}
            </span>
            <span className={`text-sm font-medium ${gainedColor}`}>
              {data.gained == null ? "" : fmtGained(data.gained)}{" "}
              <span className="text-xs font-normal text-gray-400">
                {data.gained == null ? "" : windowLabel}
              </span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// Minimal glyph paths (Facebook "f", Instagram camera) — filled.
const FB_ICON =
  "M13 22v-9h3l.5-3.5H13V7.3c0-1 .3-1.7 1.8-1.7H16.6V2.4C16.3 2.4 15.2 2.3 14 2.3c-2.6 0-4.3 1.6-4.3 4.5v2.7H6.6V13h3.1v9H13z";
const IG_ICON =
  "M12 8.2A3.8 3.8 0 1012 15.8 3.8 3.8 0 0012 8.2zm0 6.3a2.5 2.5 0 110-5 2.5 2.5 0 010 5zM17 5.6a.9.9 0 100 1.8.9.9 0 000-1.8zM12 4.6c2.4 0 2.7 0 3.7.06 2.5.1 3.6 1.3 3.7 3.7.05 1 .06 1.3.06 3.7s0 2.7-.06 3.7c-.1 2.4-1.2 3.6-3.7 3.7-1 .05-1.3.06-3.7.06s-2.7 0-3.7-.06c-2.5-.1-3.6-1.3-3.7-3.7C4.6 14.7 4.6 14.4 4.6 12s0-2.7.06-3.7c.1-2.4 1.2-3.6 3.7-3.7 1-.05 1.3-.06 3.7-.06zM12 3.3c-2.4 0-2.8 0-3.7.05C4.9 3.5 3.5 4.9 3.4 8.3c-.05.9-.05 1.3-.05 3.7s0 2.8.05 3.7c.1 3.4 1.5 4.8 4.9 4.9.9.05 1.3.05 3.7.05s2.8 0 3.7-.05c3.4-.1 4.8-1.5 4.9-4.9.05-.9.05-1.3.05-3.7s0-2.8-.05-3.7c-.1-3.4-1.5-4.8-4.9-4.9-.9-.05-1.3-.05-3.7-.05z";

// Socials snapshot for one brand — Facebook + Instagram followers and growth,
// with a timescale dropdown. Used on the MD dashboard (brand-scoped token).
function MdSocials({
  brandId,
  token,
}: {
  brandId: string;
  token: string;
}) {
  const [preset, setPreset] = useState("last_30d");
  const [social, setSocial] = useState<SocialDto | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const windowLabel = DATE_PRESETS.find((p) => p.id === preset)?.label ?? "";

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch(`/api/admin/meta/social?brand=${brandId}&preset=${preset}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (cancelled) return;
        if (!ok) {
          setError(j.error ?? "Failed to load socials");
          setSocial(null);
        } else {
          setSocial(j.social ?? null);
        }
      })
      .catch(() => !cancelled && setError("Network error"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [brandId, preset, token]);

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Socials</h2>
          <p className="mt-1 text-sm text-gray-500">
            Followers now · growth over the selected window
          </p>
        </div>
        <select
          value={preset}
          onChange={(e) => setPreset(e.target.value)}
          className="rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 shadow-sm outline-none transition hover:border-gray-300 focus:border-gray-400"
          aria-label="Timescale"
        >
          {DATE_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="mt-4 py-8 text-center text-sm text-gray-400">
          Loading socials…
        </div>
      ) : error ? (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : social ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <PlatformCell
            label="Facebook"
            icon={FB_ICON}
            data={social.facebook}
            windowLabel={windowLabel}
          />
          <PlatformCell
            label="Instagram"
            icon={IG_ICON}
            data={social.instagram}
            windowLabel={windowLabel}
          />
        </div>
      ) : null}
    </section>
  );
}

// ── Managing-director dashboard ──────────────────────────────────────────────
// A clean, brand-scoped overview for a business's MD: their team, their leads
// and how the ads are performing at a high level. Every call uses the
// brand-scoped admin routes, so an MD only ever sees their own business.
/* ── MD dashboard ─────────────────────────────────────────────────────────
   Deliberately the SAME shell as the super-admin view — the wrap-around
   chrome, a fixed sidebar, tabs down the left — so an MD isn't looking at a
   different product from the one the group team uses. The differences are
   subtractive: fewer tabs, and every figure scoped to their own business by
   the API (verified: an MD token only ever returns their brand's rows).

   The sidebar carries the brand's own colour rather than the neutral grey the
   super view uses, so it's obvious at a glance whose business you're in. */

type MdTab = "overview" | "team" | "connections" | "invites";

const MD_TABS: { id: MdTab; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10" },
  {
    id: "team",
    label: "Team",
    icon: "M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4z",
  },
  {
    id: "connections",
    label: "Connections",
    icon: "M13.5 10.5 21 3m0 0h-5m5 0v5M10.5 13.5 3 21m0 0h5m-5 0v-5",
  },
  { id: "invites", label: "Invites", icon: "M4 4h16v16H4z M22 6l-10 7L2 6" },
];

const RANGES = [
  { id: "7", label: "7 days", days: 7 },
  { id: "30", label: "30 days", days: 30 },
  { id: "90", label: "90 days", days: 90 },
  { id: "all", label: "All time", days: null as number | null },
  { id: "custom", label: "Custom", days: null as number | null },
];

function MdDashboard({
  token,
  brandId,
  name,
  onSignOut,
}: {
  token: string;
  brandId: string;
  name: string;
  onSignOut: () => void;
}) {
  const brand = brandById(brandId);
  const [tab, setTab] = useState<MdTab>("overview");
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [summaries, setSummaries] = useState<LeadSummary[]>([]);
  const [activity, setActivity] = useState<ActivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [vp, setVp] = useState({ w: 0, h: 0 });

  // Date range. "custom" reveals two date inputs; everything else is a
  // rolling window ending now.
  const [range, setRange] = useState("30");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    on();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);

  // Users and activity are range-independent; only the per-user summary is
  // refetched when the window changes, so changing the range doesn't reload
  // the whole page.
  useEffect(() => {
    let cancelled = false;
    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch("/api/admin/users", { headers }),
      fetch("/api/admin/activity", { headers }),
    ]).then(async ([us, ac]) => {
      if (cancelled) return;
      if (us.ok) setUsers(await us.json());
      if (ac.ok) setActivity(await ac.json());
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const byUser = useMemo(
    () => new Map(summaries.map((s) => [s.userId, s])),
    [summaries]
  );

  // The window as real dates, so the leads list and the in-range counts agree.
  const window_ = useMemo(() => {
    if (range === "all") return null;
    if (range === "custom") {
      if (!from || !to) return null;
      const a = new Date(from);
      const b = new Date(to);
      b.setHours(23, 59, 59, 999);
      return { from: a, to: b };
    }
    const days = Number(range);
    const b = new Date();
    const a = new Date(b.getTime() - days * 86_400_000);
    return { from: a, to: b };
  }, [range, from, to]);

  useEffect(() => {
    let cancelled = false;
    const qs = window_
      ? `?from=${window_.from.toISOString()}&to=${window_.to.toISOString()}`
      : "";
    fetch(`/api/admin/leads-summary${qs}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        if (!cancelled) setSummaries(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token, window_]);

  const leadsInRange = useMemo(() => {
    const all = activity?.leads ?? [];
    if (!window_) return all;
    return all.filter((l) => {
      const t = new Date(l.receivedAt).getTime();
      return t >= window_.from.getTime() && t <= window_.to.getTime();
    });
  }, [activity, window_]);

  const totals = useMemo(() => {
    let leads = 0;
    let converted = 0;
    let spend = 0;
    let speedSum = 0;
    let speedN = 0;
    for (const u of users) {
      const s = byUser.get(u.id);
      leads += s?.total ?? 0;
      converted += s?.converted ?? 0;
      spend += packageById(u.packageId)?.adSpend ?? 0;
      if (s?.speedMs != null && s.speedSamples > 0) {
        speedSum += s.speedMs * s.speedSamples;
        speedN += s.speedSamples;
      }
    }
    return {
      leads,
      converted,
      spend,
      rate: leads > 0 ? Math.round((converted / leads) * 100) : 0,
      speed: speedN > 0 ? speedSum / speedN : null,
    };
  }, [users, byUser]);

  if (!brand) return null;
  const accent = brand.accent;
  const attention = activity?.attention ?? [];

  const card =
    "rounded-2xl border border-gray-200 bg-white p-5 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.12),inset_0_1px_1px_rgba(255,255,255,0.7),inset_0_0_30px_rgba(0,0,0,0.06)]";

  return (
    <div className="relative isolate min-h-screen" style={{ background: "#f6f6f7" }}>
      {vp.w > 0 && <ChromeSurface vw={vp.w} vh={vp.h} />}

      {/* Sidebar — brand colour, so it's obvious whose business this is. */}
      <aside className="fixed inset-y-0 left-0 z-30 flex w-60 flex-col">
        <div className="px-5 pt-14">
          <div className="flex items-center gap-2.5">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold text-white"
              style={{ background: accent }}
            >
              {brand.name.replace(/^The\s+/, "").charAt(0)}
            </span>
            <div className="leading-tight">
              <p className="text-sm font-semibold">{brand.name}</p>
              <p className="text-xs text-gray-400">Managing Director</p>
            </div>
          </div>
        </div>

        <nav className="mt-10 flex-1 px-3">
          {MD_TABS.map((t) => {
            const on = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition"
                style={
                  on
                    ? { background: `${accent}14`, color: accent }
                    : { color: "#6b7280" }
                }
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-[18px] w-[18px]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d={t.icon} />
                </svg>
                {t.label}
              </button>
            );
          })}
        </nav>

        <div className="px-5 pb-6">
          <p className="truncate text-xs text-gray-400">{name}</p>
          <button
            onClick={onSignOut}
            className="mt-1 text-xs font-medium text-gray-500 hover:text-gray-900"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Top bar */}
      <div className="fixed inset-x-0 top-0 z-20 h-16 pl-60">
        <div className="flex h-16 items-center justify-between px-8">
          <h1 className="text-sm font-semibold capitalize">{tab}</h1>
          {(tab === "overview" || tab === "team") && (
            <RangePicker
              range={range}
              setRange={setRange}
              from={from}
              setFrom={setFrom}
              to={to}
              setTo={setTo}
              accent={accent}
            />
          )}
        </div>
      </div>

      <main className="pl-60 pt-16">
        <div className="mx-auto max-w-5xl px-8 py-8">
          {loading ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : tab === "overview" ? (
            <MdOverview
              card={card}
              accent={accent}
              users={users}
              byUser={byUser}
              totals={totals}
              leadsInRange={leadsInRange}
              attention={attention}
              rangeLabel={
                RANGES.find((r) => r.id === range)?.label ?? "30 days"
              }
            />
          ) : tab === "team" ? (
            <MdTeam card={card} accent={accent} users={users} byUser={byUser} />
          ) : tab === "connections" ? (
            <MdConnections card={card} brandName={brand.name} />
          ) : (
            <div className="space-y-6">
              {/* TEMPORARY — the TLE V1 launch panel, above the usual invites
                  so it's the first thing on the tab during launch week. Only
                  Lettings: it provisions TLE Pro partners and nobody else. */}
              {brandId === "lettings" && <TleProInvite pass={token} />}
              <MdInvites card={card} accent={accent} users={users} token={token} />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

/* 7 / 30 / 90 / all, plus a real custom window. The buttons are a single
   segmented control rather than loose pills — it reads as one control and
   stops the row looking like stock bootstrap. */
function RangePicker({
  range,
  setRange,
  from,
  setFrom,
  to,
  setTo,
  accent,
}: {
  range: string;
  setRange: (v: string) => void;
  from: string;
  setFrom: (v: string) => void;
  to: string;
  setTo: (v: string) => void;
  accent: string;
}) {
  return (
    <div className="flex items-center gap-3">
      {range === "custom" && (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs outline-none focus:border-gray-400"
          />
          <span>to</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs outline-none focus:border-gray-400"
          />
        </div>
      )}
      <div className="inline-flex rounded-full border border-gray-200 bg-white p-0.5 shadow-sm">
        {RANGES.map((r) => {
          const on = range === r.id;
          return (
            <button
              key={r.id}
              onClick={() => setRange(r.id)}
              className="rounded-full px-3 py-1.5 text-xs font-medium transition"
              style={
                on
                  ? { background: accent, color: "#fff" }
                  : { color: "#6b7280" }
              }
            >
              {r.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* A horizontal bar per team member. Deliberately CSS rather than a charting
   dependency: it's one chart, and a library would be more bytes than the
   whole admin page. */
function BarList({
  rows,
  accent,
}: {
  rows: { label: string; value: number }[];
  accent: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) {
    return <p className="text-sm text-gray-400">Nothing to show yet.</p>;
  }
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="flex items-baseline justify-between text-sm">
            <span className="truncate pr-3 text-gray-700">{r.label}</span>
            <span className="font-semibold tabular-nums">{r.value}</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${(r.value / max) * 100}%`,
                background: accent,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/* Conversion as a ring. An SVG circle with a dash offset — no dependency,
   and it animates for free via the CSS transition. */
function Donut({ pct, accent }: { pct: number; accent: string }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-32 w-32">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#f1f2f4" strokeWidth="12" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke={accent}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (Math.min(100, pct) / 100) * c}
          style={{ transition: "stroke-dashoffset 900ms ease-out" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-semibold tabular-nums">{pct}%</span>
        <span className="text-[11px] text-gray-400">converted</span>
      </div>
    </div>
  );
}

function MdOverview({
  card,
  accent,
  users,
  byUser,
  totals,
  leadsInRange,
  attention,
  rangeLabel,
}: {
  card: string;
  accent: string;
  users: UserProfile[];
  byUser: Map<string, LeadSummary>;
  totals: { leads: number; converted: number; spend: number; rate: number; speed: number | null };
  leadsInRange: ActivityLead[];
  attention: AttentionItem[];
  rangeLabel: string;
}) {
  // Leads by source, for the split. Sources are free text, so anything
  // unrecognised is grouped rather than dropped.
  const bySource = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of leadsInRange) {
      const k = (l.source || "other").toLowerCase();
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [leadsInRange]);

  const perMember = useMemo(
    () =>
      users
        .map((u) => ({ label: u.name, value: byUser.get(u.id)?.total ?? 0 }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8),
    [users, byUser]
  );

  const stats = [
    { label: "Leads", value: String(totals.leads) },
    { label: "Converted", value: String(totals.converted) },
    { label: "Team", value: String(users.length) },
    {
      label: "Speed to lead",
      value: totals.speed === null ? "—" : fmtDuration(totals.speed),
    },
    { label: "Monthly ad spend", value: `£${totals.spend.toLocaleString("en-GB")}` },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className={card}>
            <p className="text-xs text-gray-500">{s.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className={card}>
          <h2 className="text-sm font-semibold">Leads by team member</h2>
          <p className="mt-0.5 text-xs text-gray-400">{rangeLabel}</p>
          <div className="mt-5">
            <BarList rows={perMember} accent={accent} />
          </div>
        </div>

        <div className={`${card} flex flex-col items-center justify-center`}>
          <h2 className="mb-3 self-start text-sm font-semibold">Conversion</h2>
          <Donut pct={totals.rate} accent={accent} />
          <p className="mt-3 text-xs text-gray-400">
            {totals.converted} of {totals.leads} leads
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className={card}>
          <h2 className="text-sm font-semibold">Where leads came from</h2>
          <p className="mt-0.5 text-xs text-gray-400">{rangeLabel}</p>
          <div className="mt-5">
            <BarList
              rows={bySource.map(([k, v]) => ({
                label: k.charAt(0).toUpperCase() + k.slice(1),
                value: v,
              }))}
              accent={accent}
            />
          </div>
        </div>

        <div className={card}>
          <h2 className="text-sm font-semibold">Needs attention</h2>
          <p className="mt-0.5 text-xs text-gray-400">
            Leads going cold across your business
          </p>
          {attention.length ? (
            <div className="mt-4 space-y-2.5">
              {attention.slice(0, 6).map((a, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-xl border border-gray-100 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{a.leadName}</p>
                    <p className="text-xs text-gray-400">{a.agentName}</p>
                  </div>
                  <span className="shrink-0 text-xs text-gray-400">
                    {a.kind === "unanswered" ? "No answer" : "Going cold"} ·{" "}
                    {fmtDuration(a.ageMs)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-gray-400">
              Nothing needs chasing — everything&apos;s being worked.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function MdTeam({
  card,
  accent,
  users,
  byUser,
}: {
  card: string;
  accent: string;
  users: UserProfile[];
  byUser: Map<string, LeadSummary>;
}) {
  const rows = useMemo(
    () =>
      users
        .map((u) => {
          const s = byUser.get(u.id);
          const leads = s?.total ?? 0;
          const converted = s?.converted ?? 0;
          return {
            u,
            leads,
            converted,
            rate: leads ? Math.round((converted / leads) * 100) : 0,
            // mustResetPassword means the account was created for them and
            // they've never set their own password — i.e. never got started.
            started: !u.mustResetPassword,
          };
        })
        .sort((a, b) => b.leads - a.leads),
    [users, byUser]
  );

  const notStarted = rows.filter((r) => !r.started).length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className={card}>
          <p className="text-xs text-gray-500">Team</p>
          <p className="mt-1 text-2xl font-semibold">{rows.length}</p>
        </div>
        <div className={card}>
          <p className="text-xs text-gray-500">Active</p>
          <p className="mt-1 text-2xl font-semibold">
            {rows.length - notStarted}
          </p>
        </div>
        <div className={card}>
          <p className="text-xs text-gray-500">Not yet started</p>
          <p className="mt-1 text-2xl font-semibold">{notStarted}</p>
        </div>
      </div>

      <div className={card}>
        <h2 className="text-sm font-semibold">Your team</h2>
        {rows.length ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
                  <th className="pb-2 pr-4 font-medium">Name</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 pr-4 text-right font-medium">Leads</th>
                  <th className="pb-2 pr-4 text-right font-medium">Converted</th>
                  <th className="pb-2 text-right font-medium">Rate</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ u, leads, converted, rate, started }) => (
                  <tr key={u.id} className="border-b border-gray-50 last:border-0">
                    <td className="py-3 pr-4">
                      <p className="font-medium">{u.name}</p>
                      <p className="text-xs text-gray-400">{u.email}</p>
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className="rounded-full px-2.5 py-1 text-xs font-medium"
                        style={
                          started
                            ? { background: `${accent}14`, color: accent }
                            : { background: "#fef3c7", color: "#92400e" }
                        }
                      >
                        {started ? "Active" : "Not started"}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums">{leads}</td>
                    <td className="py-3 pr-4 text-right tabular-nums">{converted}</td>
                    <td className="py-3 text-right tabular-nums">{rate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 text-sm text-gray-400">
            Nobody in this business has an account yet.
          </p>
        )}
      </div>
    </div>
  );
}

/* Social icons in their own brand colours — a grey Instagram glyph reads as
   "disabled" rather than "Instagram". LinkedIn is listed ahead of launch so
   the shape of the page doesn't change when it goes live. */
const MD_SOCIALS = [
  { name: "Meta / Facebook", label: "Facebook", colour: "#1877F2" },
  { name: "Instagram", label: "Instagram", colour: "#E4405F" },
  { name: "LinkedIn", label: "LinkedIn", colour: "#0A66C2" },
];

function MdConnections({ card, brandName }: { card: string; brandName: string }) {
  return (
    <div className="space-y-6">
      <div className={card}>
        <h2 className="text-sm font-semibold">Connected accounts</h2>
        <p className="mt-0.5 text-xs text-gray-400">
          The platforms {brandName} advertises on
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {MD_SOCIALS.map((s) => {
            const icon = ICONS.find((i) => i.name === s.name);
            const live = s.label !== "LinkedIn";
            return (
              <div
                key={s.label}
                className="rounded-xl border border-gray-100 p-4"
              >
                <span
                  className="flex h-9 w-9 items-center justify-center"
                  style={{ color: s.colour }}
                >
                  {icon && <SocialIcon icon={icon} className="h-7 w-7" />}
                </span>
                <p className="mt-3 text-sm font-medium">{s.label}</p>
                <p className="mt-0.5 text-xs text-gray-400">
                  {live ? "Campaigns run here" : "Coming soon"}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Honest placeholder: follower counts and growth need the Meta/LinkedIn
          stats pull scoped per brand, which doesn't exist for MDs yet. Better
          to say so than to render a chart of nothing. */}
      <div className={card}>
        <h2 className="text-sm font-semibold">Audience growth</h2>
        <p className="mt-3 text-sm leading-relaxed text-gray-500">
          Follower counts and growth for {brandName} aren&apos;t wired into
          this view yet — the group team can see live Meta figures, and the
          per-business version is next.
        </p>
      </div>
    </div>
  );
}

function MdInvites({
  card,
  accent,
  users,
  token,
}: {
  card: string;
  accent: string;
  users: UserProfile[];
  token: string;
}) {
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{
    sent: number;
    failed: number;
    error?: string;
  } | null>(null);
  const [done, setDone] = useState<string[]>([]);

  const pending = users.filter(
    (u) => u.mustResetPassword && !u.deactivatedAt && !done.includes(u.id)
  );

  async function send() {
    if (sending || !pending.length) return;
    setResult(null);
    setSending(true);
    try {
      const res = await fetch("/api/admin/send-invites", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        // Send only who's on screen. The server re-checks brand scope anyway.
        body: JSON.stringify({ userIds: pending.map((u) => u.id) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult({ sent: 0, failed: 0, error: data?.error ?? "Couldn't send." });
      } else {
        setResult({ sent: data.sent ?? 0, failed: data.failed ?? 0 });
        // Anyone who got one drops off the list without a full reload.
        const ok = new Set(
          (data.results ?? [])
            .filter((r: { sent: boolean }) => r.sent)
            .map((r: { email: string }) => r.email)
        );
        setDone((d) => [
          ...d,
          ...pending.filter((u) => ok.has(u.email)).map((u) => u.id),
        ]);
      }
    } catch {
      setResult({ sent: 0, failed: 0, error: "Couldn't reach the server." });
    }
    setSending(false);
  }

  return (
    <div className="space-y-6">
      <div className={card}>
        <h2 className="text-sm font-semibold">Invite your team</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-500">
          Accounts are created for your people in advance. An invite emails
          them a one-time link to set their own password and get started —
          they don&apos;t need to pay for anything to use referrals.
        </p>

        {pending.length ? (
          <>
            <p className="mt-5 text-xs font-medium uppercase tracking-wide text-gray-400">
              {pending.length} waiting to be invited
            </p>
            <div className="mt-3 space-y-2">
              {pending.slice(0, 10).map((u) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between rounded-xl border border-gray-100 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{u.name}</p>
                    <p className="truncate text-xs text-gray-400">{u.email}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
                    Not started
                  </span>
                </div>
              ))}
            </div>
            {pending.length > 10 && (
              <p className="mt-3 text-xs text-gray-400">
                …and {pending.length - 10} more
              </p>
            )}
          </>
        ) : (
          <p className="mt-5 text-sm text-gray-400">
            Everyone in your business has already got started.
          </p>
        )}

        {pending.length > 0 && (
          <button
            onClick={send}
            disabled={sending}
            className="mt-6 rounded-lg px-5 py-2.5 text-sm font-medium text-white transition disabled:opacity-40"
            style={{ background: accent }}
          >
            {sending
              ? "Sending…"
              : `Invite ${pending.length} ${pending.length === 1 ? "person" : "people"}`}
          </button>
        )}

        {result && (
          <div
            className={`mt-4 rounded-xl border p-4 text-sm ${
              result.error || result.failed
                ? "border-amber-200 bg-amber-50 text-amber-900"
                : "border-green-200 bg-green-50 text-green-900"
            }`}
          >
            {result.error ? (
              <p>{result.error}</p>
            ) : (
              <p>
                Sent {result.sent}
                {result.failed > 0 && (
                  <>
                    {" "}— {result.failed} didn&apos;t go through. They&apos;ll
                    still be listed here to try again.
                  </>
                )}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
