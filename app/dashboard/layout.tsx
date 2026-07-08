"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { refreshUser, signOut, fetchNotifications } from "@/lib/session";
import { brandById, type Brand } from "@/lib/brands";
import type { UserProfile } from "@/lib/types";
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
    const t = setInterval(() => fetchNotifications().then(handle), 30000);
    return () => clearInterval(t);
  }, [checked, pathname]);

  const dotFor = (href: string) =>
    (href === "/dashboard/leads" && notifs.newLeads > 0) ||
    (href === "/dashboard/referrals" && notifs.pendingReferrals > 0);

  if (!checked || !user || !brand) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white text-sm text-gray-400">
        Loading…
      </div>
    );
  }

  return (
    <div
      className="flex min-h-screen bg-white"
      style={
        {
          "--accent": brand.accent,
          "--accent-soft": brand.accentSoft,
        } as React.CSSProperties
      }
    >
      {/* Sidebar — floated slightly off the screen with a discreet shadow */}
      <aside className="fixed inset-y-3 left-3 z-30 flex w-60 flex-col overflow-hidden rounded-2xl border border-gray-100 bg-gray-50/60 shadow-[0_4px_20px_-6px_rgba(0,0,0,0.08)]">
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

        <nav className="mt-8 flex-1 space-y-0.5 px-3">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-white text-gray-900 shadow-sm ring-1 ring-gray-100"
                    : "text-gray-500 hover:bg-white hover:text-gray-900"
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

      {/* Main */}
      <main className="ml-[264px] flex-1 px-10 py-10">{children}</main>

      {/* Campaign-stage toast — bottom-right */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-xs animate-[fade-up_0.3s_ease] rounded-2xl bg-gray-900 px-5 py-4 text-sm font-medium text-white shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}
