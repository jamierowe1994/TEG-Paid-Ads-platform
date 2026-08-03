"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import PullToRefresh from "@/components/PullToRefresh";

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

// The portal surface, matching the landing page's light grey (#f4f4f5) so the
// two read as one product. Everything — sidebar, top bar, content — sits on
// this single colour; there is no separate chrome surface and no accent wash
// behind the page. Hairlines and spacing do the dividing instead.
const PAGE_BG = "#f4f4f5";

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
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  // searchShown drives the enter/exit transition: the bar folds out of the
  // search circle on open and folds back into it on close (kept mounted a
  // beat longer so the fold-back can play). searchUp raises the bar above the
  // keyboard and lifts a clean canvas underneath once the field is focused.
  const [searchShown, setSearchShown] = useState(false);
  const [searchUp, setSearchUp] = useState(false);
  const searchWrapRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  // Tapping the search *icon* flies the bar all the way to the top in one
  // motion (searchUp). By the time the field is tapped it's already stationary
  // up there, so the tap can't miss (and iOS can't scroll it off-screen) —
  // that was the whole cause of the flaky "bounces back / skews off" behaviour.
  const openSearch = () => {
    setMobileSearchOpen(true);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        setSearchShown(true);
        setSearchUp(true);
      }),
    );
  };
  const closeSearch = () => {
    searchInputRef.current?.blur();
    setSearchShown(false);
    setSearchUp(false);
    window.setTimeout(() => {
      setMobileSearchOpen(false);
      setQuery("");
    }, 380);
  };
  // Lock the page behind the search so iOS can't scroll it while the keyboard
  // is up (belt-and-braces against the "off-screen white line" state).
  useEffect(() => {
    if (!mobileSearchOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileSearchOpen]);
  // Top-right overflow: a three-dots button that unrolls left into
  // notifications / help / profile / log out (icons only).
  const [topMenuOpen, setTopMenuOpen] = useState(false);
  // Notifications the user has cleared — kept per user in localStorage so
  // "Clear all" sticks between visits (the feed itself is derived live).
  const [cleared, setCleared] = useState<Set<string>>(new Set());
  // When a lead file is open on mobile, the bottom nav morphs into that lead's
  // quick actions (Call / Email / WhatsApp / Schedule). The open lead modal
  // broadcasts its contact details via a window event so the nav — which lives
  // out here in the shell — can persist and re-shape rather than being covered.
  const [leadNav, setLeadNav] = useState<
    null | { phone?: string; email?: string; wa?: string }
  >(null);
  useEffect(() => {
    const open = (e: Event) =>
      setLeadNav((e as CustomEvent).detail ?? {});
    const close = () => setLeadNav(null);
    window.addEventListener("teg:lead-open", open as EventListener);
    window.addEventListener("teg:lead-close", close);
    return () => {
      window.removeEventListener("teg:lead-open", open as EventListener);
      window.removeEventListener("teg:lead-close", close);
    };
  }, []);

  // Nav morph animation: on open/close, the bar collapses horizontally into
  // the middle, swaps its contents while it's pinched shut, then re-expands
  // from the centre outwards. `showLead` is which set of buttons is currently
  // rendered; `collapsing` drives the scaleX(0) pinch.
  const [showLead, setShowLead] = useState(false);
  const [collapsing, setCollapsing] = useState(false);
  // The lead's "+" action menu (log attempt / add note / add location / lost).
  const [plusOpen, setPlusOpen] = useState(false);
  useEffect(() => {
    if (!leadNav) setPlusOpen(false);
  }, [leadNav]);
  const prevLeadOpen = useRef(false);
  useEffect(() => {
    const open = !!leadNav;
    if (open === prevLeadOpen.current) return; // details changed, not the mode
    prevLeadOpen.current = open;
    setCollapsing(true); // pinch the current bar shut
    const t = setTimeout(() => {
      setShowLead(open); // swap contents while hidden
      setCollapsing(false); // re-expand from the middle
    }, 190);
    return () => clearTimeout(t);
  }, [leadNav]);

  // Let a focused notes field / an open lead-list sheet tuck the nav away so it
  // never sits under the keyboard or over a list.
  const [navHidden, setNavHidden] = useState(false);
  useEffect(() => {
    const hide = () => setNavHidden(true);
    const show = () => setNavHidden(false);
    window.addEventListener("teg:nav-hide", hide);
    window.addEventListener("teg:nav-show", show);
    return () => {
      window.removeEventListener("teg:nav-hide", hide);
      window.removeEventListener("teg:nav-show", show);
    };
  }, []);
  // The overview's pull-up "second page" flips the nav to light glass so its
  // pale content stays legible through it.
  const [navLight, setNavLight] = useState(false);
  useEffect(() => {
    const on = (e: Event) => setNavLight(!!(e as CustomEvent).detail);
    window.addEventListener("teg:nav-light", on as EventListener);
    return () => window.removeEventListener("teg:nav-light", on as EventListener);
  }, []);
  // Dark vs light glass for the nav pill / circles.
  const glass = navLight
    ? "border-black/5 bg-[rgba(255,255,255,0.6)]"
    : "border-white/10 bg-[rgba(28,28,32,0.5)]";

  // Pull-to-refresh handler: re-check leads / referrals / notifications and
  // tell the current page (via teg:refresh) to re-fetch its own data too.
  async function doRefresh() {
    window.dispatchEvent(new Event("teg:refresh"));
    await Promise.all([
      fetchLeads().then(setLeads),
      fetchReferrals().then(setReferrals),
      fetchNotifications().then(setNotifs),
    ]);
  }

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

  // Which of the four bottom-nav tabs is active — drives the sliding
  // highlight surround. -1 (e.g. on Profile) hides it.
  const mainActiveIndex = NAV.slice(0, 4).findIndex((n) => n.href === pathname);

  // Close the top overflow menu whenever we navigate.
  useEffect(() => setTopMenuOpen(false), [pathname]);

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
          // One flat surface for the whole portal, matching the landing page's
          // light grey. Nothing sits on its own colour any more — no white
          // chrome behind the sidebar or top bar, and no accent wash. The
          // structure comes from hairlines and spacing instead.
          background: PAGE_BG,
        } as React.CSSProperties
      }
    >

      {/* ── Sidebar controls (desktop only) ── */}
      {/* The nav has no fill of its own — it's separated from the content by a
          single rule running the full height of the screen. */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-gray-900/[0.13] lg:flex">
        <div className="px-6 pt-11">
          <Link href="/dashboard" aria-label="Launch Pad" className="block">
            <svg
              viewBox="0 0 24 24"
              className="h-7 w-7 -rotate-45 text-gray-900"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09z" />
              <path d="M12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 01-4 2z" />
              <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
            </svg>
          </Link>
          {/* Initials, not the full name: "The Commercial Property Experts"
              wrapped to three lines and dominated the whole sidebar. */}
          <h1 className="mt-7 text-[26px] font-semibold leading-none tracking-tight">
            {brand.initials}
          </h1>
          <p className="mt-2 text-[10.5px] uppercase tracking-[0.14em] text-gray-400">
            Paid Ads Portal
          </p>
        </div>

        <nav className="mt-10 flex-1 space-y-1.5 px-3">
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
                  className={`flex w-full items-center gap-3 rounded-lg px-3.5 py-2.5 text-[14.5px] font-medium transition ${
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
                className={`flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-[14.5px] font-medium transition ${
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

        {/* Name and photo only — the email was noise, and they know their own
            address. Sign out drops its box for an icon and a label. */}
        <div className="px-5 pb-7">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-200 text-base font-semibold text-gray-600">
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
            <p className="min-w-0 flex-1 truncate text-[15px] font-medium">
              {user.name}
            </p>
          </div>
          <button
            onClick={() => {
              signOut();
              router.push("/");
            }}
            className="mt-5 flex items-center gap-3 px-0.5 text-[13.5px] font-medium text-gray-400 transition hover:text-gray-900"
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
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
            Sign out
          </button>
        </div>
      </aside>

      {/* Pull-to-refresh (mobile) — drag down from the top to re-check leads */}
      <PullToRefresh onRefresh={doRefresh} />

      {/* ══ MOBILE top bar (<lg): the page title on the LEFT, and a three-dots
          overflow on the right that unrolls into help / profile / log out.
          Search + notifications now live in the bottom bar. Scrolls away with
          the page; pt clears the status bar / notch in standalone. ══ */}
      <div className="relative z-40 flex items-center justify-between bg-[#f4f4f5] px-4 pb-2 pt-[calc(env(safe-area-inset-top)+16px)] lg:hidden">
        <div className="flex flex-col items-start">
          <span className="text-xl font-semibold tracking-tight text-gray-900">
            {NAV.find((n) => n.href === pathname)?.label ?? brand.name}
          </span>
          <span
            className="mt-1 h-[3px] w-7 rounded-full"
            style={{ backgroundColor: brand.accent }}
          />
        </div>
        {/* Three-dots overflow + notifications, in one dark bubble. The dots
            (and its unroll of help / profile / log out) sit to the left; the
            notifications bell is the always-visible endcap on the right. */}
        <div className="relative flex h-11 w-[84px] shrink-0 items-center justify-end">
          <div
            className="absolute right-0 top-1/2 flex -translate-y-1/2 flex-row-reverse items-center gap-0.5 overflow-hidden rounded-full bg-[rgba(28,28,32,0.5)] backdrop-blur-2xl backdrop-saturate-150 p-1 shadow-[0_6px_22px_-6px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.14)] transition-[max-width] duration-[320ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
            style={{ maxWidth: topMenuOpen ? 216 : 88 }}
          >
            {/* Notifications — always visible (far right) */}
            <button
              onClick={() => setBellOpen(true)}
              aria-label="Notifications"
              className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-200 active:bg-white/10"
            >
              <svg className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" />
              </svg>
              {unread > 0 && (
                <span
                  className="absolute right-1 top-1 flex h-[17px] min-w-[17px] items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white"
                  style={{ backgroundColor: "#e11d48" }}
                >
                  {unread}
                </span>
              )}
            </button>

            {/* Dots / close — the menu toggle */}
            <button
              onClick={() => setTopMenuOpen((v) => !v)}
              aria-label={topMenuOpen ? "Close menu" : "Menu"}
              className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-200 active:bg-white/10"
            >
              {topMenuOpen ? (
                <svg className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
                </svg>
              ) : (
                <svg className="h-[22px] w-[22px]" fill="currentColor" viewBox="0 0 24 24">
                  <circle cx="5" cy="12" r="1.9" />
                  <circle cx="12" cy="12" r="1.9" />
                  <circle cx="19" cy="12" r="1.9" />
                </svg>
              )}
            </button>

            {/* Help */}
            <button
              onClick={() => { setTopMenuOpen(false); window.dispatchEvent(new Event("teg:toggle-help")); }}
              aria-label="Help"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-200 active:bg-white/10"
            >
              <svg className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="9.25" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M12 17.25h.008v.008H12v-.008z" />
              </svg>
            </button>

            {/* Profile */}
            <button
              onClick={() => { setTopMenuOpen(false); router.push("/dashboard/profile"); }}
              aria-label="Profile"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-200 active:bg-white/10"
            >
              <svg className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </button>

            {/* Log out */}
            <button
              onClick={() => { signOut(); router.push("/"); }}
              aria-label="Log out"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-200 active:bg-white/10"
            >
              <svg className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M15 12H3m0 0l4-4m-4 4l4 4M13 4h5a2 2 0 012 2v12a2 2 0 01-2 2h-5" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Tap-away closes the top overflow menu */}
      {topMenuOpen && (
        <button
          aria-hidden
          className="fixed inset-0 z-[35] cursor-default lg:hidden"
          onClick={() => setTopMenuOpen(false)}
        />
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
          <div className="fixed inset-x-2 top-[calc(env(safe-area-inset-top)+62px)] z-50 max-h-[72vh] overflow-y-auto rounded-2xl border border-gray-200 bg-white p-2 shadow-xl">
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

      {/* Mobile search — the bar folds out of the search circle (pushing the
          nav off to the left). Tapping in flies the bar up to the top of the
          screen (where the keyboard can't cover it) with the results dropping
          in on a clean panel underneath. */}
      {mobileSearchOpen && (
        <div className="lg:hidden">
          {/* Blackout — clear while the bar unfolds so you can watch the nav
              slide off, then blurs everything the moment you start typing. */}
          <button
            aria-hidden
            onClick={closeSearch}
            className="fixed left-0 right-0 z-[93] cursor-default transition-[background-color,backdrop-filter,opacity] duration-[360ms] ease-out"
            style={{
              // Over-cover well past the viewport in both directions so the
              // blur reaches the very bottom even past where the page content
              // ends (and behind the keyboard).
              top: "-50vh",
              bottom: "-50vh",
              opacity: searchShown ? 1 : 0,
              backgroundColor: searchUp ? "rgba(9,9,11,0.5)" : "rgba(9,9,11,0)",
              backdropFilter: searchUp ? "blur(18px)" : "blur(0px)",
              WebkitBackdropFilter: searchUp ? "blur(18px)" : "blur(0px)",
            }}
          />

          {/* Bar + results as one unit. Folds out at the bottom, then flies to
              the top on focus so the keyboard never covers it. */}
          <div
            ref={searchWrapRef}
            className="fixed inset-x-3 top-0 z-[96]"
            style={{
              transform: searchUp
                ? "translateY(calc(env(safe-area-inset-top) + 12px))"
                : "translateY(calc(100dvh - 82px))",
              transition: "transform 0.52s cubic-bezier(0.32,1.42,0.4,1)",
            }}
          >
            {/* The bar — folds out of / back into the search circle (origin
                right). Milky dark glass, matching the nav. */}
            <div
              className="flex items-center gap-3 rounded-full border border-white/10 bg-[rgba(28,28,32,0.5)] px-5 py-4 text-gray-200 shadow-[0_16px_40px_-10px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.14),inset_0_-1px_0_rgba(0,0,0,0.25)] backdrop-blur-2xl backdrop-saturate-150"
              style={{
                transformOrigin: "right center",
                transform: searchShown ? "scaleX(1)" : "scaleX(0.14)",
                opacity: searchShown ? 1 : 0,
                transition: "transform 0.44s cubic-bezier(0.34,1.55,0.5,1), opacity 0.28s ease",
              }}
            >
              <svg className="h-6 w-6 shrink-0 text-gray-300" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.3-4.3" />
              </svg>
              <input
                ref={searchInputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setSearchUp(true)}
                onKeyDown={(e) => { if (e.key === "Enter") { openFirstResult(); closeSearch(); } }}
                placeholder="Search leads, referrals, pages…"
                className="min-w-0 flex-1 bg-transparent text-[15px] text-white outline-none placeholder:text-gray-400"
              />
              <button
                onClick={query ? () => setQuery("") : closeSearch}
                aria-label={query ? "Clear" : "Close search"}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gray-300 transition-transform active:scale-90 active:bg-white/10"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            {/* Results — once the bar has flown to the top, this clean panel
                unfolds from its middle outwards in a big, slow, exaggerated
                sweep. */}
            <div
              className="overflow-hidden rounded-[26px] border border-white/70 bg-white/97 backdrop-blur-2xl shadow-[0_28px_64px_-28px_rgba(0,0,0,0.55)]"
              style={{
                marginTop: "10px",
                maxHeight: "64vh",
                transformOrigin: "center center",
                transform: searchUp ? "scale(1, 1)" : "scale(0.86, 0.015)",
                opacity: searchUp ? 1 : 0,
                transition: searchUp
                  ? "transform 1.15s cubic-bezier(0.18,1.12,0.32,1) 0.34s, opacity 0.55s ease 0.34s"
                  : "transform 0.28s ease, opacity 0.2s ease",
              }}
            >
              <div className="max-h-[64vh] overflow-y-auto px-2.5 py-2.5">
                {!q ? (
                  <p className="px-3 py-9 text-center text-sm text-gray-400">
                    Search for a lead, a referral, or a page.
                  </p>
                ) : !hasResults ? (
                  <p className="px-3 py-9 text-center text-sm text-gray-400">
                    No matches for “{query}”.
                  </p>
                ) : (
                  <>
                    {search.leads.length > 0 && (
                      <SearchGroup label="Leads">
                        {search.leads.map((l) => (
                          <SearchRow key={l.id} icon="✨" title={l.name} sub={`via ${l.source} · ${l.stage}`} onClick={() => { closeSearch(); go(`/dashboard/leads?lead=${l.id}`); }} />
                        ))}
                      </SearchGroup>
                    )}
                    {search.referrals.length > 0 && (
                      <SearchGroup label="Referrals">
                        {search.referrals.map((r) => (
                          <SearchRow key={r.id} icon="↩︎" title={r.leadName} sub={`${r.direction === "received" ? "From" : "To"} ${brandById(r.direction === "received" ? r.fromBrandId : r.toBrandId)?.shortName ?? ""}`} onClick={() => { closeSearch(); go("/dashboard/referrals"); }} />
                        ))}
                      </SearchGroup>
                    )}
                    {search.pages.length > 0 && (
                      <SearchGroup label="Pages">
                        {search.pages.map((p) => (
                          <SearchRow key={p.href} icon="→" title={p.label} sub="Go to page" onClick={() => { closeSearch(); go(p.href); }} />
                        ))}
                      </SearchGroup>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Top bar controls (desktop only) ── */}
      {/* Sat down off the top edge and in from the right — nothing bounds this
          bar any more, so it needs its own margin rather than sitting flush. */}
      <header className="fixed left-[248px] right-0 top-0 z-40 hidden h-16 items-center justify-between gap-3 px-9 pt-7 lg:flex">
        {/* Search — normal size, expands when focused */}
        <div
          className={`relative transition-[width] duration-300 ease-out ${
            searchOpen ? "w-[460px]" : "w-72"
          }`}
        >
          <div className="flex h-10 items-center gap-2 rounded-lg border border-gray-900/[0.10] bg-transparent px-3.5">
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
            className="relative flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 transition hover:text-gray-900"
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
      <main className="px-4 pb-24 pt-3 lg:ml-[248px] lg:px-8 lg:pb-8 lg:pt-[104px]">
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

      {/* ══ MOBILE bottom nav (<lg) — a dark, edge-to-edge pill: Overview ·
          Leads · Referrals · All Ads, with a lighter surround that slides to
          the active tab. When a lead file is open it morphs (pinches to the
          centre + re-opens) into that lead's actions — Call · Email · WhatsApp
          · Schedule. Overflow (notifications / help / profile / log out) lives
          in the top-right three-dots menu now. */}
      <div
        className="fixed inset-x-0 bottom-0 z-[90] flex items-center justify-center px-2.5 pb-[calc(env(safe-area-inset-bottom)/2+8px)] lg:hidden"
        style={{
          transform: navHidden ? "translateY(170%)" : "translateY(0)",
          transition: "transform 0.3s cubic-bezier(0.4,0,0.2,1)",
        }}
      >
        {/* This wrapper pinches shut to the centre and re-opens when the bar
            morphs between the main nav and a lead's actions. */}
        <div
          className="flex w-full items-center justify-center gap-2.5"
          style={{
            transform: collapsing ? "scaleX(0)" : "scaleX(1)",
            transformOrigin: "center",
            transition: "transform 0.19s cubic-bezier(0.5,0,0.5,1)",
          }}
        >
          {showLead ? (
            <>
            {/* Contact channels — a pill of four, mirroring the home nav, with
                a separate "+" circle where the search circle sits. */}
            <div className="flex flex-1 items-stretch rounded-full border border-white/10 bg-[rgba(28,28,32,0.5)] backdrop-blur-2xl backdrop-saturate-150 p-1.5 shadow-[0_12px_34px_-8px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.14),inset_0_-1px_0_rgba(0,0,0,0.25)]">
              <a
                href={leadNav?.phone ? `tel:${leadNav.phone}` : undefined}
                aria-label="Call"
                className={`flex flex-1 items-center justify-center rounded-full py-[12px] text-gray-200 ${leadNav?.phone ? "active:bg-white/[0.13]" : "pointer-events-none opacity-40"}`}
              >
                <svg className="h-[27px] w-[27px] text-white" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.13.81.36 1.6.68 2.34a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.13-1.13a2 2 0 012.11-.45c.74.32 1.53.55 2.34.68A2 2 0 0122 16.92z" />
                </svg>
              </a>
              <a
                href={leadNav?.email ? `mailto:${leadNav.email}` : undefined}
                aria-label="Email"
                className={`flex flex-1 items-center justify-center rounded-full py-[12px] text-gray-200 ${leadNav?.email ? "active:bg-white/[0.13]" : "pointer-events-none opacity-40"}`}
              >
                <svg className="h-[27px] w-[27px] text-white" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <path d="M3 7l9 6 9-6" />
                </svg>
              </a>
              <a
                href={leadNav?.wa ? `https://wa.me/${leadNav.wa}` : undefined}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="WhatsApp"
                className={`flex flex-1 items-center justify-center rounded-full py-[12px] text-gray-200 ${leadNav?.wa ? "active:bg-white/[0.13]" : "pointer-events-none opacity-40"}`}
              >
                <svg className="h-[32px] w-[32px] text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.6 6.32A7.85 7.85 0 0012 4a7.94 7.94 0 00-6.9 11.9L4 20l4.2-1.1A7.9 7.9 0 0012 20a7.95 7.95 0 005.6-13.68zM12 18.5a6.55 6.55 0 01-3.36-.92l-.24-.14-2.49.65.66-2.43-.16-.25A6.57 6.57 0 1112 18.5zm3.6-4.93c-.2-.1-1.17-.58-1.35-.64s-.31-.1-.44.1-.5.63-.62.76-.23.15-.43.05a5.36 5.36 0 01-1.58-.98 5.94 5.94 0 01-1.1-1.36c-.11-.2 0-.3.09-.4l.3-.35a1.37 1.37 0 00.2-.33.37.37 0 000-.35c-.05-.1-.44-1.07-.6-1.46s-.32-.33-.44-.33h-.38a.72.72 0 00-.52.24 2.19 2.19 0 00-.68 1.63 3.82 3.82 0 00.8 2.03 8.72 8.72 0 003.34 2.95c.47.2.83.33 1.11.42a2.68 2.68 0 001.23.08 2 2 0 001.3-.93 1.62 1.62 0 00.12-.92c-.05-.08-.18-.13-.38-.23z" />
                </svg>
              </a>
              <button
                onClick={() => window.dispatchEvent(new Event("teg:lead-schedule"))}
                aria-label="Schedule"
                className="flex flex-1 items-center justify-center rounded-full py-[12px] text-gray-200 active:bg-white/[0.13]"
              >
                <svg className="h-[27px] w-[27px] text-white" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <rect x="3" y="5" width="18" height="16" rx="2" />
                  <path d="M3 9h18M8 3v4M16 3v4" />
                </svg>
              </button>
            </div>

            {/* "+" — everything else (log / note / location / lost) lives here.
                Sits exactly where the home search circle does. */}
            <button
              onClick={() => setPlusOpen((v) => !v)}
              aria-label="More actions"
              className="flex h-[65px] w-[65px] shrink-0 items-center justify-center rounded-full border border-white/10 bg-[rgba(28,28,32,0.5)] backdrop-blur-2xl backdrop-saturate-150 text-white shadow-[0_12px_34px_-8px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.14),inset_0_-1px_0_rgba(0,0,0,0.25)] transition-transform duration-[300ms] ease-[cubic-bezier(0.34,1.56,0.64,1)] active:scale-[0.88]"
            >
              <svg
                className="h-[30px] w-[30px] transition-transform duration-[300ms] ease-[cubic-bezier(0.34,1.56,0.64,1)]"
                style={{ transform: plusOpen ? "rotate(45deg)" : "rotate(0deg)" }}
                fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 24 24"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
            </>
          ) : (
            <>
            <div
              className={`relative flex flex-1 items-stretch rounded-full border ${glass} backdrop-blur-2xl backdrop-saturate-150 p-1.5 shadow-[0_12px_34px_-8px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.14),inset_0_-1px_0_rgba(0,0,0,0.25)]`}
              style={{
                transform: searchShown ? "translateX(-135%)" : "translateX(0)",
                opacity: searchShown ? 0 : 1,
                transition: "transform 0.44s cubic-bezier(0.34,1.5,0.5,1), opacity 0.3s ease",
              }}
            >
              {/* Sliding highlight — a slightly lighter surround that flows to
                  the active tab. */}
              <div
                className={`pointer-events-none absolute inset-y-1.5 left-1.5 rounded-full transition-[transform,opacity] duration-[320ms] ease-[cubic-bezier(0.4,0,0.2,1)] ${navLight ? "bg-black/[0.06]" : "bg-white/[0.13]"}`}
                style={{
                  width: "calc((100% - 12px) / 4)",
                  transform: `translateX(${Math.max(mainActiveIndex, 0) * 100}%)`,
                  opacity: mainActiveIndex >= 0 ? 1 : 0,
                }}
              />
              {NAV.slice(0, 4).map((item) => {
                const active = pathname === item.href;
                const locked = isReferralOnly && item.paidOnly;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-label={item.label}
                    className="relative z-10 flex flex-1 items-center justify-center py-[12px]"
                  >
                    <span className="relative">
                      <svg
                        className={`h-[27px] w-[27px] ${active && !locked ? (navLight ? "text-gray-900" : "text-white") : (navLight ? "text-gray-500" : "text-gray-400")}`}
                        fill="none" stroke="currentColor" strokeWidth={1.8}
                        strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"
                      >
                        <path d={item.icon} />
                      </svg>
                      {locked && (
                        <svg className="absolute -right-2 -top-1.5 h-3.5 w-3.5 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-label="Locked">
                          <rect x="5" y="11" width="14" height="9" rx="2" />
                          <path d="M8 11V8a4 4 0 018 0v3" strokeLinecap="round" />
                        </svg>
                      )}
                      {dotFor(item.href) && (
                        <span className="absolute -right-1.5 -top-1 h-2 w-2 rounded-full" style={{ backgroundColor: brand.accent }} />
                      )}
                    </span>
                  </Link>
                );
              })}
            </div>

            {/* Search bubble — a circle, same shape as the old "+" bubble. */}
            <button
              onClick={openSearch}
              aria-label="Search"
              className={`flex h-[65px] w-[65px] shrink-0 items-center justify-center rounded-full border ${glass} ${navLight ? "text-gray-700" : "text-gray-200"} backdrop-blur-2xl backdrop-saturate-150 shadow-[0_12px_34px_-8px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.14),inset_0_-1px_0_rgba(0,0,0,0.25)] transition-[transform,opacity] duration-[300ms] ease-[cubic-bezier(0.34,1.56,0.64,1)] active:scale-[0.88]`}
              style={{ opacity: searchShown ? 0 : 1 }}
            >
              <svg className="h-[28px] w-[28px]" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.3-4.3" />
              </svg>
            </button>
            </>
          )}
        </div>
      </div>

      {/* Lead "+" menu — every action you can take on a lead, popped up out of
          the "+" circle. Dispatches to the open lead file, which does the work. */}
      {showLead && plusOpen && !navHidden && (
        <div className="lg:hidden">
          <button
            aria-hidden
            onClick={() => setPlusOpen(false)}
            className="fixed inset-0 z-[94] cursor-default"
          />
          <div
            className="fixed right-3 z-[95] w-60 origin-bottom-right animate-[search-pop_0.26s_cubic-bezier(0.34,1.56,0.64,1)] overflow-hidden rounded-[28px] border border-white/10 bg-[rgba(28,28,32,0.86)] p-1.5 text-white shadow-[0_22px_50px_-12px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.14),inset_0_-1px_0_rgba(0,0,0,0.3)] backdrop-blur-2xl backdrop-saturate-150"
            style={{ bottom: "calc(env(safe-area-inset-bottom)/2 + 8px + 78px)" }}
          >
            {[
              { label: "Log attempt", ev: "teg:lead-log", d: "M9 11l3 3 8-8M20 12v6a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h9" },
              { label: "Add a note", ev: "teg:lead-note", d: "M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" },
              { label: "Add location", ev: "teg:lead-location", d: "M12 21s-6-5.7-6-10a6 6 0 1112 0c0 4.3-6 10-6 10z" },
            ].map((it) => (
              <button
                key={it.ev}
                onClick={() => { window.dispatchEvent(new Event(it.ev)); setPlusOpen(false); }}
                className="flex w-full items-center gap-3 rounded-[22px] px-3.5 py-3 text-left text-[15px] font-medium text-gray-100 transition active:bg-white/10"
              >
                <svg className="h-5 w-5 shrink-0 text-gray-300" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <path d={it.d} />
                  {it.ev === "teg:lead-location" && <circle cx="12" cy="11" r="2" />}
                </svg>
                {it.label}
              </button>
            ))}
            <div className="mx-3.5 my-1 h-px bg-white/10" />
            <button
              onClick={() => { window.dispatchEvent(new Event("teg:lead-lost")); setPlusOpen(false); }}
              className="flex w-full items-center gap-3 rounded-[22px] px-3.5 py-3 text-left text-[15px] font-medium text-red-300 transition active:bg-white/10"
            >
              <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="9" />
                <path d="M5.6 5.6l12.8 12.8" />
              </svg>
              Mark as lost
            </button>
          </div>
        </div>
      )}

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
