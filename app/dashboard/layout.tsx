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
import type { UserProfile, Lead, Referral } from "@/lib/types";
import BrandMark from "@/components/BrandMark";

// Toast copy when the admin advances a customer's campaign stage.
const STAGE_TOAST: Record<string, string> = {
  creatives: "We've started building your ad creatives 🎨",
  review: "Your creative designs are ready — take a look and approve 👀",
  live: "🎉 Your ads are live!",
};

const NAV = [
  { href: "/dashboard", label: "Overview", icon: "M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10" },
  { href: "/dashboard/leads", label: "Leads", icon: "M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4z" },
  { href: "/dashboard/referrals", label: "Referrals", icon: "M8 7h12m0 0l-4-4m4 4l-4 4M16 17H4m0 0l4 4m-4-4l4-4" },
  { href: "/dashboard/grow", label: "Grow", icon: "M3 17l6-6 4 4 8-8M21 7v6M21 7h-6" },
  { href: "/dashboard/notes", label: "Notes", icon: "M9 12h6m-6 4h6M5 4h14a1 1 0 011 1v14l-3-2-3 2-3-2-3 2V5a1 1 0 011-1z" },
  { href: "/dashboard/profile", label: "Profile", icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" },
];

const GLASS =
  "border border-gray-200/70 bg-white/70 backdrop-blur-xl shadow-[0_4px_24px_-8px_rgba(0,0,0,0.12)]";

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

  useEffect(() => {
    // Validate the session against the server (httpOnly cookie), not just the
    // localStorage cache — this is what makes sign-in real and secure.
    refreshUser().then((u) => {
      if (!u) {
        router.replace("/login");
        return;
      }
      setUser(u);
      setBrand(brandById(u.brandId) ?? null);
      setChecked(true);
    });
  }, [router]);

  // Notification dots + campaign-stage toast — refresh on navigation and on a
  // light interval. When the admin advances the customer's stage, we detect
  // the change against the last-seen stage and pop a toast.
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
    const t = setInterval(() => fetchNotifications().then(handle), 30000);
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

  // ── Notifications feed ────────────────────────────────────────────────────
  const feed = useMemo(() => {
    const items: {
      key: string;
      icon: string;
      title: string;
      sub: string;
      href: string;
      at?: string;
    }[] = [];
    if (user?.onboardingStage && STAGE_TOAST[user.onboardingStage]) {
      items.push({
        key: "stage",
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
        at: r.createdAt,
      });
    }
    for (const l of leads.filter((x) => x.stage === "new").slice(0, 8)) {
      items.push({
        key: `lead-${l.id}`,
        icon: "✨",
        title: `New lead: ${l.name}`,
        sub: `via ${l.source}`,
        href: `/dashboard/leads?lead=${l.id}`,
        at: l.receivedAt,
      });
    }
    return items;
  }, [user, leads, referrals]);
  const unread = notifs.newLeads + notifs.pendingReferrals;

  if (!checked || !user || !brand) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white text-sm text-gray-400">
        Loading…
      </div>
    );
  }

  return (
    <div
      className="relative min-h-screen"
      style={
        {
          "--accent": brand.accent,
          "--accent-soft": brand.accentSoft,
          background:
            "radial-gradient(1100px 460px at 100% -5%, var(--accent-soft), transparent 70%), #fafafa",
        } as React.CSSProperties
      }
    >
      {/* ── Left sidebar ── */}
      <aside
        className={`fixed inset-y-3 left-3 z-30 flex w-60 flex-col overflow-hidden rounded-2xl ${GLASS}`}
      >
        <div className="flex items-center gap-2.5 px-5 pb-5 pt-8">
          <BrandMark
            name={brand.name}
            accent={brand.accent}
            logo={brand.logo}
            size={42}
          />
          <div className="leading-tight">
            <p className="text-sm font-semibold">{brand.name}</p>
            <p className="text-xs text-gray-400">Paid Ads Portal</p>
          </div>
        </div>

        <nav className="mt-6 flex-1 space-y-0.5 px-3">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-white text-gray-900 shadow-sm ring-1 ring-gray-100"
                    : "text-gray-500 hover:bg-white/70 hover:text-gray-900"
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
                  style={active ? { color: brand.accent } : undefined}
                >
                  <path d={item.icon} />
                </svg>
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

        {/* User card */}
        <div className="border-t border-gray-100 p-4">
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
            className="mt-3 w-full rounded-lg border border-gray-200 py-1.5 text-xs font-medium text-gray-500 transition hover:bg-white hover:text-gray-900"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Top bar (search + notifications) ── */}
      <header
        className={`fixed left-[264px] right-3 top-3 z-30 flex h-16 items-center gap-3 rounded-2xl px-3 xl:right-[264px] ${GLASS}`}
      >
        {/* Search */}
        <div className="relative flex-1">
          <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white/80 px-3.5 py-2">
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
              onKeyDown={(e) => {
                if (e.key === "Enter") openFirstResult();
                if (e.key === "Escape") setSearchOpen(false);
              }}
              placeholder="Search leads, referrals, pages…"
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
            <>
              <button
                className="fixed inset-0 z-10 cursor-default"
                aria-hidden
                onClick={() => setSearchOpen(false)}
              />
              <div className="absolute left-0 right-0 top-full z-20 mt-2 max-h-[70vh] overflow-y-auto rounded-2xl border border-gray-200 bg-white p-2 shadow-xl">
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
            </>
          )}
        </div>

        {/* Notifications bell */}
        <div className="relative">
          <button
            onClick={() => setBellOpen((v) => !v)}
            className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white/80 text-gray-500 transition hover:text-gray-900"
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
                <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Notifications
                </p>
                <NotificationsFeed
                  items={feed}
                  accent={brand.accent}
                  onGo={(href) => {
                    setBellOpen(false);
                    router.push(href);
                  }}
                />
              </div>
            </>
          )}
        </div>
      </header>

      {/* ── Right notifications rail (xl and up) ── */}
      <aside
        className={`fixed inset-y-3 right-3 z-20 hidden w-60 flex-col overflow-hidden rounded-2xl xl:flex ${GLASS}`}
      >
        <div className="flex items-center justify-between px-4 pb-2 pt-5">
          <p className="text-sm font-semibold">Notifications</p>
          {unread > 0 && (
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
              style={{ backgroundColor: brand.accent }}
            >
              {unread} new
            </span>
          )}
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-4">
          <NotificationsFeed
            items={feed}
            accent={brand.accent}
            onGo={(href) => router.push(href)}
          />
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="ml-[264px] mr-3 px-8 pb-8 pt-[84px] xl:mr-[264px]">
        {children}
      </main>

      {/* Campaign-stage toast — bigger white card with a black outline */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm animate-[fade-up_0.3s_ease] rounded-2xl border-2 border-gray-900 bg-white px-6 py-5 text-[15px] font-semibold text-gray-900 shadow-2xl">
          {toast}
        </div>
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
    at?: string;
  }[];
  accent: string;
  onGo: (href: string) => void;
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
          onClick={() => onGo(it.href)}
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
