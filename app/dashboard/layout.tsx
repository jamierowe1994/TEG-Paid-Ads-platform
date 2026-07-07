"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { refreshUser, signOut } from "@/lib/session";
import { brandById, type Brand } from "@/lib/brands";
import type { UserProfile } from "@/lib/types";
import BrandMark from "@/components/BrandMark";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: "M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10" },
  { href: "/dashboard/leads", label: "Leads", icon: "M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4z" },
  { href: "/dashboard/referrals", label: "Referrals", icon: "M8 7h12m0 0l-4-4m4 4l-4 4M16 17H4m0 0l4 4m-4-4l4-4" },
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
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 flex w-60 flex-col border-r border-gray-100 bg-gray-50/40">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <BrandMark
            name={brand.name}
            accent={brand.accent}
            logo={brand.logo}
            size={32}
          />
          <div className="leading-tight">
            <p className="text-sm font-semibold">{brand.name}</p>
            <p className="text-xs text-gray-400">Paid Ads Portal</p>
          </div>
        </div>

        <nav className="mt-4 flex-1 space-y-0.5 px-3">
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
      <main className="ml-60 flex-1 px-10 py-10">{children}</main>
    </div>
  );
}
