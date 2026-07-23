"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  refreshUser,
  signOut,
  fetchNotifications,
  fetchLeads,
  fetchReferrals,
} from "@/lib/session";
import { brandById, type Brand } from "@/lib/brands";
import { getPreviewBrandId, getPreviewAccent } from "@/lib/preview";
import type { UserProfile, Lead, Referral } from "@/lib/types";
import HelpCentre from "@/components/HelpCentre";
import SetPasswordGate from "@/components/SetPasswordGate";
import PaidLockOverlay from "@/components/PaidLockOverlay";
import MobileLoading from "@/components/MobileLoading";

// Toast copy when the admin advances a customer's campaign stage.
const STAGE_TOAST: Record<string, string> = {
  creatives: "We've started building your ad creatives 🎨",
  review: "Your creative designs are ready — take a look 👀",
  live: "🎉 Your ads are live!",
};

// `paidOnly` items are locked for referrals-only accounts (they show a padlock
// and can't be opened until the agent upgrades to Paid Ads).
const NAV: { href: string; label: string; icon: string; paidOnly?: boolean }[] = [
  { href: "/dashboard", label: "Overview", paidOnly: true, icon: "M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10" },
  { href: "/dashboard/leads", label: "Leads", paidOnly: true, icon: "M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4z" },
  { href: "/dashboard/referrals", label: "Referrals", icon: "M8 7h12m0 0l-4-4m4 4l-4 4M16 17H4m0 0l4 4m-4-4l4-4" },
  // Grow — hidden for now, bringing it back later.
  // { href: "/dashboard/grow", label: "Grow", icon: "M3 17l6-6 4 4 8-8M21 7v6M21 7h-6" },
  { href: "/dashboard/ads", label: "All Ads", paidOnly: true, icon: "M4 5h16a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1zm2 11l4-5 3 3 2-2 3 4M9 9.5a.5.5 0 11-1 0 .5.5 0 011 0z" },
  { href: "/dashboard/profile", label: "Profile", icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" },
];

// Per-page copy for the "Activate Paid Ads" lock card a referrals-only account
// sees when it opens one of the paid pages.
const LOCK_COPY: Record<string, { title: string; blurb: string }> = {
  "/dashboard": {
    title: "Your Overview lives here",
    blurb:
      "Activate Paid Ads to see your live campaign, lead numbers and ad spend at a glance.",
  },
  "/dashboard/leads": {
    title: "Your lead funnel lives here",
    blurb:
      "Activate Paid Ads and every lead from your ads lands here — ready to call, book and convert.",
  },
  "/dashboard/ads": {
    title: "Your live ads live here",
    blurb:
      "Activate Paid Ads to see the creatives we run for you and how each one is performing.",
  },
};

// Per-brand glow strength (hex alpha). Muted accents (bronze/gold) need more
// to read; vivid ones (red) need less so they don't overpower.
const GLOW_ALPHA: Record<string, string> = {
  property: "18",
  lettings: "18",
  mortgage: "26",
  recruitment: "40",
  commercial: "26",
  fineandcountry: "34",
  auction: "24",
};

// Chrome geometry (px). The nav is flush to the screen's left/top/bottom edges;
// the content sits inside, and the two arms join with a concave swoop.
const SIDEBAR_W = 240;
const TOPBAR_H = 64;
const SWOOP = 22;

// The whole chrome is drawn as ONE seamless white L-shape (left arm + top arm)
// via a clip-path, so there's no seam/line where the sidebar meets the top bar.
// The concave corner is part of the path. Interactive controls float on top.
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

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [checked, setChecked] = useState(false);
  const [notifs, setNotifs] = useState({ newLeads: 0, pendingReferrals: 0 });
  const [toast, setToast] = useState("");

  const [leads, setLeads] = useState<Lead[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  // Mobile-only chrome: the three-dots menu (Notifications / Help / Profile)
  // and the tap-to-open search sheet. Desktop ignores these.
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  // Notifications the user has cleared — kept per user in localStorage so
  // "Clear all" sticks between visits (the feed itself is derived live).
  const [cleared, setCleared] = useState<Set<string>>(new Set());
  const [vp, setVp] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    on();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);

  useEffect(() => {
    refreshUser().then((u) => {
      if (!u) {
        router.replace("/login");
        return;
      }
      setUser(u);
      // Apply the temporary brand/colour preview override if one is set.
      let b = brandById(getPreviewBrandId() ?? u.brandId) ?? brandById(u.brandId) ?? null;
      const pa = getPreviewAccent();
      if (b && pa) b = { ...b, accent: pa };
      setBrand(b);
      setChecked(true);
    });
  }, [router]);

  const isReferralOnly = user?.accountType === "referral";

  // Referrals-only accounts still see the paid pages, but blurred behind an
  // "Activate Paid Ads" card (see the main render below) — so they know what's
  // there and what unlocks it, rather than being bounced away.
  const onLockedRoute =
    isReferralOnly && NAV.some((n) => n.href === pathname && n.paidOnly);

  // For a referrals-only account, Referrals is their home — bump it to the top
  // of the nav so the sidebar leads with what they actually use.
  const navItems = useMemo(() => {
    if (!isReferralOnly) return NAV;
    const referrals = NAV.filter((n) => n.href === "/dashboard/referrals");
    const rest = NAV.filter((n) => n.href !== "/dashboard/referrals");
    return [...referrals, ...rest];
  }, [isReferralOnly]);

  // Notification dots + campaign-stage toast — refresh on navigation and on a
  // light interval.
  useEffect(() => {
    if (!checked) return;
    function handle(n: Awaited<ReturnType<typeof fetchNotifications>>) {
      setNotifs(n);
      if (n.stage) {
        const seen = localStorage.getItem("teg_seen_stage");
        if (seen && seen !== n.stage && STAGE_TOAST[n.stage]) {
          setToast(STAGE_TOAST[n.stage]);
          setTimeout(() => setToast(""), 7000);
          refreshUser().then((u) => u && setUser(u));
        }
        localStorage.setItem("teg_seen_stage", n.stage);
      }
    }
    fetchNotifications().then(handle);
    fetchLeads().then(setLeads);
    fetchReferrals().then(setReferrals);
    // The bell feed/badge derive from leads + referrals, so those refresh on
    // the same poll — a lead landing via the background sync shows up within
    // 30s without navigating.
    const t = setInterval(() => {
      fetchNotifications().then(handle);
      fetchLeads().then(setLeads);
      fetchReferrals().then(setReferrals);
    }, 30000);
    return () => clearInterval(t);
  }, [checked, pathname]);

  const dotFor = (href: string) =>
    (href === "/dashboard/leads" && notifs.newLeads > 0) ||
    (href === "/dashboard/referrals" && notifs.pendingReferrals > 0);

  // ── Search ────────────────────────────────────────────────────────────────
  const q = query.trim().toLowerCase();
  const search = useMemo(() => {
    if (!q) return { leads: [], referrals: [], pages: [] };
    return {
      leads: leads.filter((l) => l.name.toLowerCase().includes(q)).slice(0, 6),
      referrals: referrals
        .filter((r) => r.leadName.toLowerCase().includes(q))
        .slice(0, 4),
      pages: NAV.filter((n) => n.label.toLowerCase().includes(q)),
    };
  }, [q, leads, referrals]);
  const hasResults =
    search.leads.length + search.referrals.length + search.pages.length > 0;

  function go(href: string) {
    setQuery("");
    setSearchOpen(false);
    router.push(href);
  }
  function openFirstResult() {
    if (search.leads[0]) go(`/dashboard/leads?lead=${search.leads[0].id}`);
    else if (search.referrals[0]) go("/dashboard/referrals");
    else if (search.pages[0]) go(search.pages[0].href);
  }

  // Load this user's cleared-notification keys once we know who they are.
  useEffect(() => {
    if (!user) return;
    try {
      const raw = localStorage.getItem(`notifs-cleared-${user.id}`);
      if (raw) setCleared(new Set(JSON.parse(raw) as string[]));
    } catch {
      /* fresh start */
    }
  }, [user]);

  function persistCleared(next: Set<string>) {
    setCleared(next);
    try {
      if (user) {
        // Prune to keys that can still appear (they're in the live feed) —
        // anything else can never match again, so storing it is dead weight
        // that could push real cleared keys past the cap.
        const liveKeys = new Set(feed.map((i) => i.key));
        const kept = [...next].filter((k) => liveKeys.has(k));
        localStorage.setItem(
          `notifs-cleared-${user.id}`,
          JSON.stringify(kept.slice(-1000))
        );
      }
    } catch {
      /* storage full/blocked — clearing just won't stick */
    }
  }

  // ── Notifications feed ────────────────────────────────────────────────────
  const feed = useMemo(() => {
    const items: {
      key: string;
      icon: string;
      title: string;
      sub: string;
      href: string;
    }[] = [];
    if (user?.onboardingStage && STAGE_TOAST[user.onboardingStage]) {
      items.push({
        // Keyed per stage — clearing "creatives ready" must not also clear
        // the future "you're live" update (cleared keys persist).
        key: `stage-${user.onboardingStage}`,
        icon: "🎯",
        title: STAGE_TOAST[user.onboardingStage].replace(/\s*[🎨👀🎉]+/gu, ""),
        sub: "Campaign update",
        href: "/dashboard",
      });
    }
    for (const r of referrals.filter(
      (x) => x.direction === "received" && x.status === "pending"
    )) {
      items.push({
        key: `ref-${r.id}`,
        icon: "↩︎",
        title: `Referral: ${r.leadName}`,
        sub: "Waiting for you to accept",
        href: "/dashboard/referrals",
      });
    }
    // Every new lead — the panel scrolls, so nothing gets cut off when a
    // batch lands at once. The key carries the lead's LATEST "new" timestamp,
    // so a snoozed lead that resurfaces gets a fresh notification even if its
    // original one was cleared.
    for (const l of leads.filter((x) => x.stage === "new" && !x.archivedAt)) {
      const lastNewAt =
        [...l.history].reverse().find((h) => h.stage === "new")?.at ??
        l.receivedAt;
      items.push({
        key: `lead-${l.id}-${lastNewAt}`,
        icon: "✨",
        title: `New lead: ${l.name}`,
        sub: `via ${l.source}`,
        href: `/dashboard/leads?lead=${l.id}`,
      });
    }
    return items;
  }, [user, leads, referrals]);
  // What's actually showing (cleared ones stay hidden) drives the badge.
  const visibleFeed = useMemo(
    () => feed.filter((i) => !cleared.has(i.key)),
    [feed, cleared]
  );
  const unread = visibleFeed.length;

  if (!checked || !user || !brand) {
    return (
      <>
        {/* Desktop keeps its minimal text; mobile gets the branded splash. */}
        <div className="hidden min-h-screen items-center justify-center bg-white text-sm text-gray-400 lg:flex">
          Loading…
        </div>
        <MobileLoading />
      </>
    );
  }

  return (
    <div
      className="relative min-h-screen isolate"
      style={
        {
          "--accent": brand.accent,
          "--accent-soft": brand.accentSoft,
          background: "#f6f6f7",
        } as React.CSSProperties
      }
    >
      {/* Ambient glow — soft accent light anchored in the bottom-right corner,
          radiating up and to the left across the page. It gently breathes out
          from the corner rather than wandering. -z-10 so the tiles'
          backdrop-blur picks it up and refracts it. */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div
          className="glow-blob glow-a"
          style={{
            inset: 0,
            borderRadius: 0,
            background: `radial-gradient(120% 120% at 100% 100%, ${brand.accent}${GLOW_ALPHA[brand.id] ?? "24"}, transparent 58%)`,
          }}
        />
        <div
          className="glow-blob glow-b"
          style={{
            inset: 0,
            borderRadius: 0,
            background: `radial-gradient(75% 75% at 100% 100%, ${brand.accent}14, transparent 60%)`,
          }}
        />
      </div>

      {/* One seamless white chrome surface (sidebar + top bar + swoop) —
          desktop only; mobile uses the top bar + bottom nav below. */}
      <div className="hidden lg:block">
        {vp.w > 0 && <ChromeSurface vw={vp.w} vh={vp.h} />}
      </div>

      {/* ── Sidebar controls (desktop only) ── */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col lg:flex">
        <div className="px-5 pt-[108px]">
          <h1 className="text-xl font-semibold leading-[1.15] tracking-tight">
            {brand.name.split(" ").map((w, i) => (
              <span key={i} className="block">
                {w}
              </span>
            ))}
          </h1>
          <p className="mt-1.5 text-[11px] uppercase tracking-wide text-gray-400">
            Paid Ads Portal
          </p>
        </div>

        <nav className="mt-8 flex-1 space-y-0.5 px-3">
          {navItems.map((item) => {
            const active = pathname === item.href;
            const locked = isReferralOnly && item.paidOnly;
            const icon = (
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                viewBox="0 0 24 24"
                style={active && !locked ? { color: brand.accent } : undefined}
              >
                <path d={item.icon} />
              </svg>
            );
            if (locked) {
              // Still navigable — opening it shows the blurred page + the
              // "Activate Paid Ads" card, not a dead end.
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title="Activate Paid Ads to unlock"
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                    active
                      ? "bg-gray-50 text-gray-500"
                      : "text-gray-300 hover:text-gray-500"
                  }`}
                >
                  {icon}
                  {item.label}
                  <svg className="ml-auto h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-label="Locked">
                    <rect x="5" y="11" width="14" height="9" rx="2" />
                    <path d="M8 11V8a4 4 0 018 0v3" strokeLinecap="round" />
                  </svg>
                </Link>
              );
            }
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active
                    ? "text-gray-900"
                    : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                }`}
                style={active ? { backgroundColor: brand.accentSoft } : undefined}
              >
                {icon}
                {item.label}
                {dotFor(item.href) && (
                  <span
                    className="ml-auto h-2 w-2 rounded-full"
                    style={{ backgroundColor: brand.accent }}
                    aria-label="New items"
                  />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-gray-200 text-sm font-semibold text-gray-600">
              {user.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.photo}
                  alt={user.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                user.name.charAt(0).toUpperCase()
              )}
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-medium">{user.name}</p>
              <p className="truncate text-xs text-gray-400">{user.email}</p>
            </div>
          </div>
          <button
            onClick={() => {
              signOut();
              router.push("/");
            }}
            className="mt-3 w-full rounded-lg border border-gray-200 py-1.5 text-xs font-medium text-gray-500 transition hover:bg-gray-50 hover:text-gray-900"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* ══ MOBILE top bar (<lg): search icon · page title · three-dots ══ */}
      <div className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-gray-100 bg-white/90 px-2 backdrop-blur lg:hidden">
        <button
          onClick={() => setMobileSearchOpen(true)}
          aria-label="Search"
          className="flex h-10 w-10 items-center justify-center rounded-full text-gray-600 active:bg-gray-100"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" strokeLinecap="round" />
          </svg>
        </button>
        <span className="text-sm font-semibold text-gray-900">
          {NAV.find((n) => n.href === pathname)?.label ?? brand.name}
        </span>
        <button
          onClick={() => setMobileMenuOpen((v) => !v)}
          aria-label="Menu"
          className="relative flex h-10 w-10 items-center justify-center rounded-full text-gray-700 active:bg-gray-100"
        >
          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="5" r="1.75" />
            <circle cx="12" cy="12" r="1.75" />
            <circle cx="12" cy="19" r="1.75" />
          </svg>
          {unread > 0 && (
            <span
              className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full"
              style={{ backgroundColor: brand.accent }}
            />
          )}
        </button>
      </div>

      {/* Three-dots menu → Notifications / Help / Profile */}
      {mobileMenuOpen && (
        <>
          <button
            className="fixed inset-0 z-40 cursor-default lg:hidden"
            aria-hidden
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="fixed right-2 top-14 z-50 w-56 overflow-hidden rounded-2xl border border-gray-200 bg-white p-1.5 shadow-xl lg:hidden">
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                setBellOpen(true);
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-gray-700 active:bg-gray-50"
            >
              <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                <path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Notifications
              {unread > 0 && (
                <span
                  className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold text-white"
                  style={{ backgroundColor: brand.accent }}
                >
                  {unread}
                </span>
              )}
            </button>
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                window.dispatchEvent(new Event("teg:toggle-help"));
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-gray-700 active:bg-gray-50"
            >
              <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="9.25" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M12 17.25h.008v.008H12v-.008z" />
              </svg>
              Help
            </button>
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                router.push("/dashboard/profile");
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-gray-700 active:bg-gray-50"
            >
              <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Profile
            </button>
          </div>
        </>
      )}

      {/* Mobile notifications sheet (bellOpen; the desktop dropdown is inside
          the hidden desktop header, so this is the phone equivalent) */}
      {bellOpen && (
        <div className="lg:hidden">
          <button
            className="fixed inset-0 z-40 cursor-default"
            aria-hidden
            onClick={() => setBellOpen(false)}
          />
          <div className="fixed inset-x-2 top-14 z-50 max-h-[72vh] overflow-y-auto rounded-2xl border border-gray-200 bg-white p-2 shadow-xl">
            <div className="flex items-center justify-between px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Notifications
              </p>
              {visibleFeed.length > 0 && (
                <button
                  onClick={() =>
                    persistCleared(
                      new Set([...cleared, ...visibleFeed.map((i) => i.key)])
                    )
                  }
                  className="text-xs font-medium text-gray-400 active:text-gray-700"
                >
                  Clear all
                </button>
              )}
            </div>
            <NotificationsFeed
              items={visibleFeed}
              accent={brand.accent}
              onGo={(href, key) => {
                setBellOpen(false);
                persistCleared(new Set([...cleared, key]));
                const leadId = href.match(/[?&]lead=([^&]+)/)?.[1];
                if (leadId) {
                  window.dispatchEvent(
                    new CustomEvent("teg:open-lead", { detail: leadId })
                  );
                }
                router.push(href);
              }}
            />
          </div>
        </div>
      )}

      {/* Mobile search sheet — full screen, reuses the same search state */}
      {mobileSearchOpen && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-white lg:hidden">
          <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2.5">
            <button
              onClick={() => {
                setMobileSearchOpen(false);
                setQuery("");
              }}
              aria-label="Close search"
              className="flex h-9 w-9 items-center justify-center rounded-full text-gray-600 active:bg-gray-100"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path d="M15 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  openFirstResult();
                  setMobileSearchOpen(false);
                }
              }}
              placeholder="Search leads, referrals, pages…"
              className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-gray-400"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                aria-label="Clear"
                className="flex h-9 w-9 items-center justify-center rounded-full text-gray-300 active:bg-gray-100"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {!q ? (
              <p className="px-3 py-10 text-center text-sm text-gray-400">
                Search for a lead, a referral, or a page.
              </p>
            ) : !hasResults ? (
              <p className="px-3 py-10 text-center text-sm text-gray-400">
                No matches for “{query}”.
              </p>
            ) : (
              <>
                {search.leads.length > 0 && (
                  <SearchGroup label="Leads">
                    {search.leads.map((l) => (
                      <SearchRow
                        key={l.id}
                        icon="✨"
                        title={l.name}
                        sub={`via ${l.source} · ${l.stage}`}
                        onClick={() => {
                          setMobileSearchOpen(false);
                          go(`/dashboard/leads?lead=${l.id}`);
                        }}
                      />
                    ))}
                  </SearchGroup>
                )}
                {search.referrals.length > 0 && (
                  <SearchGroup label="Referrals">
                    {search.referrals.map((r) => (
                      <SearchRow
                        key={r.id}
                        icon="↩︎"
                        title={r.leadName}
                        sub={`${r.direction === "received" ? "From" : "To"} ${brandById(r.direction === "received" ? r.fromBrandId : r.toBrandId)?.shortName ?? ""}`}
                        onClick={() => {
                          setMobileSearchOpen(false);
                          go("/dashboard/referrals");
                        }}
                      />
                    ))}
                  </SearchGroup>
                )}
                {search.pages.length > 0 && (
                  <SearchGroup label="Pages">
                    {search.pages.map((p) => (
                      <SearchRow
                        key={p.href}
                        icon="→"
                        title={p.label}
                        sub="Go to page"
                        onClick={() => {
                          setMobileSearchOpen(false);
                          go(p.href);
                        }}
                      />
                    ))}
                  </SearchGroup>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Top bar controls (desktop only) ── */}
      <header className="fixed left-[240px] right-0 top-0 z-40 hidden h-16 items-center justify-between gap-3 px-6 lg:flex">
        {/* Search — normal size, expands when focused */}
        <div
          className={`relative transition-[width] duration-300 ease-out ${
            searchOpen ? "w-[460px]" : "w-72"
          }`}
        >
          <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2">
            <svg
              className="h-4 w-4 shrink-0 text-gray-400"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" strokeLinecap="round" />
            </svg>
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
              onKeyDown={(e) => {
                if (e.key === "Enter") openFirstResult();
                if (e.key === "Escape") (e.target as HTMLInputElement).blur();
              }}
              placeholder="Search…"
              className="w-full bg-transparent text-sm outline-none placeholder:text-gray-400"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="shrink-0 text-gray-300 hover:text-gray-500"
                aria-label="Clear"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>

          {searchOpen && q && (
            <div
              onMouseDown={(e) => e.preventDefault()}
              className="absolute left-0 right-0 top-full z-20 mt-2 max-h-[70vh] overflow-y-auto rounded-2xl border border-gray-200 bg-white p-2 shadow-xl"
            >
              {!hasResults && (
                  <p className="px-3 py-6 text-center text-sm text-gray-400">
                    No matches for “{query}”.
                  </p>
                )}
                {search.leads.length > 0 && (
                  <SearchGroup label="Leads">
                    {search.leads.map((l) => (
                      <SearchRow
                        key={l.id}
                        icon="✨"
                        title={l.name}
                        sub={`via ${l.source} · ${l.stage}`}
                        onClick={() => go(`/dashboard/leads?lead=${l.id}`)}
                      />
                    ))}
                  </SearchGroup>
                )}
                {search.referrals.length > 0 && (
                  <SearchGroup label="Referrals">
                    {search.referrals.map((r) => (
                      <SearchRow
                        key={r.id}
                        icon="↩︎"
                        title={r.leadName}
                        sub={`${r.direction === "received" ? "From" : "To"} ${brandById(r.direction === "received" ? r.fromBrandId : r.toBrandId)?.shortName ?? ""}`}
                        onClick={() => go("/dashboard/referrals")}
                      />
                    ))}
                  </SearchGroup>
                )}
                {search.pages.length > 0 && (
                  <SearchGroup label="Pages">
                    {search.pages.map((p) => (
                      <SearchRow
                        key={p.href}
                        icon="→"
                        title={p.label}
                        sub="Go to page"
                        onClick={() => go(p.href)}
                      />
                    ))}
                  </SearchGroup>
                )}
            </div>
          )}
        </div>

        {/* Notifications bell */}
        <div className="relative">
          <button
            onClick={() => setBellOpen((v) => !v)}
            className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-gray-500 transition hover:text-gray-900"
            aria-label="Notifications"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {unread > 0 && (
              <span
                className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white"
                style={{ backgroundColor: brand.accent }}
              >
                {unread}
              </span>
            )}
          </button>
          {bellOpen && (
            <>
              <button
                className="fixed inset-0 z-10 cursor-default"
                aria-hidden
                onClick={() => setBellOpen(false)}
              />
              <div className="absolute right-0 top-full z-20 mt-2 w-80 rounded-2xl border border-gray-200 bg-white p-2 shadow-xl">
                <div className="flex items-center justify-between px-3 py-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Notifications
                  </p>
                  {visibleFeed.length > 0 && (
                    <button
                      onClick={() =>
                        persistCleared(
                          new Set([...cleared, ...visibleFeed.map((i) => i.key)])
                        )
                      }
                      className="text-xs font-medium text-gray-400 hover:text-gray-700"
                    >
                      Clear all
                    </button>
                  )}
                </div>
                {/* Scrolls — a big batch of leads never gets cut off */}
                <div className="max-h-[26rem] overflow-y-auto overscroll-contain">
                  <NotificationsFeed
                    items={visibleFeed}
                    accent={brand.accent}
                    onGo={(href, key) => {
                      setBellOpen(false);
                      // Opening one deals with it — it leaves the list.
                      persistCleared(new Set([...cleared, key]));
                      // Already on the leads page? router.push won't remount
                      // it, so also announce which lead to pop open.
                      const leadId = href.match(/[?&]lead=([^&]+)/)?.[1];
                      if (leadId) {
                        window.dispatchEvent(
                          new CustomEvent("teg:open-lead", { detail: leadId })
                        );
                      }
                      router.push(href);
                    }}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </header>

      {/* ── Main ── (mobile: no sidebar margin, room for the top bar + bottom
          nav; desktop margins/padding unchanged) */}
      <main className="px-4 pb-24 pt-[68px] lg:ml-[240px] lg:px-8 lg:pb-10 lg:pt-[176px]">
        {onLockedRoute ? (
          <PaidLockOverlay
            accent={brand.accent}
            title={LOCK_COPY[pathname]?.title ?? "This is a Paid Ads page"}
            blurb={
              LOCK_COPY[pathname]?.blurb ??
              "Activate Paid Ads to unlock this page."
            }
            onActivate={() => router.push("/dashboard/profile")}
          >
            {children}
          </PaidLockOverlay>
        ) : (
          children
        )}
      </main>

      {/* ══ MOBILE bottom nav (<lg): Overview · Leads · Referrals · All Ads ══ */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex h-[68px] items-stretch border-t border-gray-100 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {NAV.slice(0, 4).map((item) => {
          const active = pathname === item.href;
          const locked = isReferralOnly && item.paidOnly;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="relative flex flex-1 flex-col items-center justify-center gap-1"
              style={active && !locked ? { color: brand.accent } : undefined}
            >
              <span className="relative">
                <svg
                  className={`h-6 w-6 ${active && !locked ? "" : "text-gray-400"}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  viewBox="0 0 24 24"
                >
                  <path d={item.icon} />
                </svg>
                {locked && (
                  <svg className="absolute -right-1.5 -top-1 h-3 w-3 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-label="Locked">
                    <rect x="5" y="11" width="14" height="9" rx="2" />
                    <path d="M8 11V8a4 4 0 018 0v3" strokeLinecap="round" />
                  </svg>
                )}
                {dotFor(item.href) && (
                  <span
                    className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full"
                    style={{ backgroundColor: brand.accent }}
                  />
                )}
              </span>
              <span
                className={`text-[11px] font-medium ${
                  active && !locked ? "" : "text-gray-500"
                }`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Campaign-stage toast — bigger white card with a black outline.
          Sits above the Help Centre launcher so the two never overlap. */}
      {toast && (
        <div className="fixed bottom-24 right-6 z-50 max-w-sm animate-[fade-up_0.3s_ease] rounded-2xl border-2 border-gray-900 bg-white px-6 py-5 text-[15px] font-semibold text-gray-900 shadow-2xl">
          {toast}
        </div>
      )}

      {/* Help Centre — floating button, searchable articles, and the
          speed-to-lead nudges that pop out of it when idle. */}
      <HelpCentre />

      {/* Pre-provisioned accounts: nothing happens until they swap the shared
          launch password for one of their own. */}
      {user.mustResetPassword && (
        <SetPasswordGate
          user={user}
          accent={brand.accent}
          onDone={(u) => setUser(u)}
        />
      )}
    </div>
  );
}

function SearchGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="py-1">
      <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
        {label}
      </p>
      {children}
    </div>
  );
}

function SearchRow({
  icon,
  title,
  sub,
  onClick,
}: {
  icon: string;
  title: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-gray-50"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-sm">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-gray-800">{title}</p>
        <p className="truncate text-xs capitalize text-gray-400">{sub}</p>
      </div>
    </button>
  );
}

function NotificationsFeed({
  items,
  accent,
  onGo,
}: {
  items: {
    key: string;
    icon: string;
    title: string;
    sub: string;
    href: string;
  }[];
  accent: string;
  onGo: (href: string, key: string) => void;
}) {
  if (items.length === 0) {
    return (
      <p className="px-3 py-8 text-center text-sm text-gray-400">
        You&apos;re all caught up. 🎉
      </p>
    );
  }
  return (
    <div className="space-y-1">
      {items.map((it) => (
        <button
          key={it.key}
          onClick={() => onGo(it.href, it.key)}
          className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-gray-50"
        >
          <span
            className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm"
            style={{ backgroundColor: `${accent}1a` }}
          >
            {it.icon}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-gray-800">
              {it.title}
            </p>
            <p className="truncate text-xs text-gray-400">{it.sub}</p>
          </div>
        </button>
      ))}
    </div>
  );
}
