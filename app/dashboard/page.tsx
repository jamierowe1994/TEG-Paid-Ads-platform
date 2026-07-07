"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getUser, getLeads } from "@/lib/session";
import { brandById, type Brand } from "@/lib/brands";
import { packageById } from "@/lib/packages";
import type { UserProfile, Lead } from "@/lib/types";

// Campaign preparation timeline — statuses will be driven by the admin
// backend later; for now every new account sits at "Creatives in production".
const CAMPAIGN_STEPS = [
  { label: "Signed up", done: true },
  { label: "Creatives in production", done: false, current: true },
  { label: "Campaign review", done: false },
  { label: "Ads live", done: false },
];

export default function DashboardOverview() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);

  useEffect(() => {
    const u = getUser();
    if (!u) return;
    setUser(u);
    setBrand(brandById(u.brandId) ?? null);
    setLeads(getLeads());
  }, []);

  if (!user || !brand) return null;

  const pkg = packageById(user.packageId);
  const converted = leads.filter(
    (l) => l.stage === "converted" || l.stage === "pushed"
  ).length;

  const stats = [
    { label: "Impressions", value: "—", note: "Live once ads launch" },
    { label: "Clicks", value: "—", note: "Live once ads launch" },
    { label: "Leads", value: String(leads.length), note: "All time" },
    { label: "Converted", value: String(converted), note: brand.conversionLabel },
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <p className="text-sm text-gray-400">
        {new Date().toLocaleDateString("en-GB", {
          weekday: "long",
          day: "numeric",
          month: "long",
        })}
      </p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">
        Morning, {user.name.split(" ")[0]} 👋
      </h1>

      {/* Campaign status */}
      <section className="mt-10 rounded-2xl border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Your campaign</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              {pkg?.name} package ·{" "}
              {user.platforms
                .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
                .join(" + ")}
            </p>
            <p className="mt-1 text-sm text-gray-400">
              Ad-spend cap £{pkg?.adSpend}/mo ·{" "}
              <Link
                href="/dashboard/grow"
                className="font-medium hover:underline"
                style={{ color: brand.accent }}
              >
                Increase →
              </Link>
            </p>
          </div>
          <span
            className="rounded-full px-3 py-1 text-xs font-medium"
            style={{ backgroundColor: brand.accentSoft, color: brand.accent }}
          >
            In preparation
          </span>
        </div>
        <div className="mt-8 flex items-center">
          {CAMPAIGN_STEPS.map((step, i) => (
            <div key={step.label} className="flex flex-1 items-center last:flex-none">
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${
                    step.done
                      ? "text-white"
                      : step.current
                        ? "border-2 bg-white"
                        : "border border-gray-200 bg-white text-gray-300"
                  }`}
                  style={
                    step.done
                      ? { backgroundColor: brand.accent }
                      : step.current
                        ? { borderColor: brand.accent, color: brand.accent }
                        : undefined
                  }
                >
                  {step.done ? "✓" : i + 1}
                </div>
                <span
                  className={`mt-2 w-24 text-center text-xs ${
                    step.done || step.current
                      ? "font-medium text-gray-700"
                      : "text-gray-400"
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {i < CAMPAIGN_STEPS.length - 1 && (
                <div
                  className="mx-2 mb-6 h-px flex-1"
                  style={{
                    backgroundColor: step.done ? brand.accent : "#E5E7EB",
                  }}
                />
              )}
            </div>
          ))}
        </div>
        <p className="mt-6 rounded-xl bg-gray-50 p-4 text-sm text-gray-500">
          Our team is preparing your ad creatives for{" "}
          <span className="font-medium text-gray-700">
            {user.platforms.join(" and ")}
          </span>{" "}
          based on your goal:{" "}
          <span className="font-medium text-gray-700">“{user.goal}”</span>.
          You'll see everything here as it's ready for review.
        </p>
      </section>

      {/* Stats */}
      <section className="mt-6 grid gap-4 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-gray-200 p-5">
            <p className="text-sm text-gray-500">{s.label}</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight">
              {s.value}
            </p>
            <p className="mt-1 text-xs text-gray-400">{s.note}</p>
          </div>
        ))}
      </section>

      {/* Recent leads */}
      <section className="mt-6 rounded-2xl border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Recent leads</h2>
          <Link
            href="/dashboard/leads"
            className="text-sm font-medium accent-text hover:underline"
          >
            View all →
          </Link>
        </div>
        <div className="mt-4 divide-y divide-gray-100">
          {leads.slice(0, 3).map((lead) => (
            <div key={lead.id} className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium">{lead.name}</p>
                <p className="text-xs text-gray-400">
                  via {lead.source} ·{" "}
                  {new Date(lead.receivedAt).toLocaleDateString("en-GB")}
                </p>
              </div>
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium capitalize text-gray-600">
                {lead.stage === "converted" || lead.stage === "pushed"
                  ? brand.conversionLabel
                  : lead.stage.replace("attempt", "Attempt ")}
              </span>
            </div>
          ))}
          {leads.length === 0 && (
            <p className="py-6 text-center text-sm text-gray-400">
              Leads will appear here once your ads are live.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
