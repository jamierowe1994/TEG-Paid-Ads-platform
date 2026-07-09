"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  getUser,
  fetchLeads,
  approveCampaign,
  sendCampaignFeedback,
} from "@/lib/session";
import { brandById, type Brand } from "@/lib/brands";
import { packageById } from "@/lib/packages";
import { ONBOARDING_STAGES, stageIndex } from "@/lib/onboarding";
import Confetti from "@/components/Confetti";
import type { UserProfile, Lead } from "@/lib/types";

const CARD =
  "rounded-2xl border border-gray-200/70 bg-white/70 backdrop-blur-xl shadow-sm";

// Stat-tile icons (stroke SVGs) keyed by label.
const STAT_ICON: Record<string, string> = {
  Impressions: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z",
  Clicks: "M3 3l7 17 2.5-7.5L20 10z",
  Leads:
    "M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4z",
  Converted: "M20 6L9 17l-5-5",
};

export default function DashboardOverview() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [feedbackText, setFeedbackText] = useState("");
  const [reviewStatus, setReviewStatus] = useState("");
  const [approving, setApproving] = useState(false);

  async function approve() {
    if (approving) return;
    setApproving(true);
    const u = await approveCampaign();
    setApproving(false);
    if (u) setUser(u);
  }
  async function submitFeedback() {
    const text = feedbackText.trim();
    if (!text) return;
    const u = await sendCampaignFeedback(text);
    if (u) {
      setUser(u);
      setFeedbackText("");
      setReviewStatus("Sent to the team ✓");
      setTimeout(() => setReviewStatus(""), 3000);
    }
  }

  useEffect(() => {
    const u = getUser();
    if (!u) return;
    setUser(u);
    setBrand(brandById(u.brandId) ?? null);
    fetchLeads().then(setLeads);
  }, []);

  // Leads bucketed into the last 6 weeks (oldest left, this week right).
  const weekly = useMemo(() => {
    const WEEKS = 6;
    const WEEK = 7 * 24 * 3600 * 1000;
    const now = Date.now();
    const buckets = Array(WEEKS).fill(0) as number[];
    for (const l of leads) {
      const wi = Math.floor((now - new Date(l.receivedAt).getTime()) / WEEK);
      if (wi >= 0 && wi < WEEKS) buckets[WEEKS - 1 - wi]++;
    }
    return buckets;
  }, [leads]);

  // Most-run ad (from lead sources) — stands in as "current ad" until Meta
  // feeds per-agent ad data.
  const topAd = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of leads)
      if (l.adName) counts.set(l.adName, (counts.get(l.adName) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }, [leads]);

  if (!user || !brand) return null;

  const pkg = packageById(user.packageId);
  const converted = leads.filter(
    (l) => l.stage === "converted" || l.stage === "pushed"
  ).length;
  const untouched = leads.filter((l) => l.stage === "new");

  // Timeline driven by the admin-set onboarding stage.
  const curStage = stageIndex(user.onboardingStage);
  const isLive = user.onboardingStage === "live";
  const campaignSteps = ONBOARDING_STAGES.map((s, i) => ({
    label: s.label,
    done: i < curStage || isLive,
    current: i === curStage && !isLive && user.onboardingStage !== "paused",
  }));
  const doneCount = campaignSteps.filter((s) => s.done).length;

  const stats = [
    { label: "Impressions", value: "—", note: "Live once ads launch" },
    { label: "Clicks", value: "—", note: "Live once ads launch" },
    { label: "Leads", value: String(leads.length), note: "All time" },
    { label: "Converted", value: String(converted), note: brand.conversionLabel },
  ];

  const isReview =
    user.onboardingStage === "review" && !user.campaignApproved;
  const maxWeek = Math.max(1, ...weekly);

  return (
    <div className="w-full">
      {/* Greeting — left aligned */}
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

      {/* Stat tiles — icon left, big number, label under */}
      <section className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className={`${CARD} p-5`}>
            <div className="flex items-center gap-3">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                style={{ backgroundColor: brand.accentSoft }}
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  viewBox="0 0 24 24"
                  style={{ color: brand.accent }}
                >
                  <path d={STAT_ICON[s.label]} />
                  {s.label === "Impressions" && (
                    <circle cx="12" cy="12" r="3" />
                  )}
                </svg>
              </span>
              <div>
                <p className="text-3xl font-semibold leading-none tracking-tight">
                  {s.value}
                </p>
                <p className="mt-1.5 text-xs font-medium text-gray-500">
                  {s.label}
                </p>
              </div>
            </div>
            <p className="mt-3 text-[11px] text-gray-400">{s.note}</p>
          </div>
        ))}
      </section>

      {/* Review & approve — surfaced full-width only while awaiting sign-off */}
      {isReview && (
        <section
          className="mt-4 rounded-2xl border-2 bg-white/70 p-6 backdrop-blur-xl"
          style={{ borderColor: `${brand.accent}55` }}
        >
          {(user.campaignAssets ?? []).length > 0 && (
            <div className="mb-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
                Your creatives
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {(user.campaignAssets ?? []).map((a) =>
                  a.type === "image" ? (
                    <a key={a.id} href={a.url} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={a.url}
                        alt={a.caption ?? "Creative"}
                        className="aspect-square w-full rounded-xl border border-gray-200 object-cover transition hover:opacity-90"
                      />
                      {a.caption && (
                        <p className="mt-1 text-xs text-gray-500">{a.caption}</p>
                      )}
                    </a>
                  ) : (
                    <div key={a.id}>
                      <video
                        src={a.url}
                        controls
                        className="aspect-square w-full rounded-xl border border-gray-200 object-cover"
                      />
                      {a.caption && (
                        <p className="mt-1 text-xs text-gray-500">{a.caption}</p>
                      )}
                    </div>
                  )
                )}
              </div>
            </div>
          )}
          <p className="text-sm font-semibold text-gray-900">
            Your creatives are ready to review
          </p>
          <p className="mt-1 text-sm text-gray-500">
            Happy with everything? Give it the final sign-off. Spotted something
            — a typo, a colour, the wrong brand — pop it below and we&apos;ll fix
            it before it goes live.
          </p>
          <textarea
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            rows={2}
            placeholder="Any changes before we go live? (optional)"
            className="mt-3 w-full rounded-xl border border-gray-200 bg-white p-3 text-sm outline-none focus:border-gray-900"
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={approve}
              disabled={approving}
              className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
              style={{ backgroundColor: brand.accent }}
            >
              {approving ? "Approving…" : "Approve & go live"}
            </button>
            <button
              onClick={submitFeedback}
              disabled={!feedbackText.trim()}
              className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
            >
              Send feedback
            </button>
            {reviewStatus && (
              <span className="text-xs text-gray-500">{reviewStatus}</span>
            )}
          </div>
        </section>
      )}

      {/* Bento grid */}
      <section className="mt-4 grid gap-4 lg:grid-cols-3">
        {/* Campaign — onboarding task list (dark card) */}
        <div className="relative overflow-hidden rounded-2xl bg-gray-900 p-6 text-white shadow-sm">
          <Confetti fire={isLive} />
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-semibold">Your campaign</h2>
              <p className="mt-0.5 text-xs text-white/50">
                {pkg?.name} package · £{pkg?.adSpend}/mo cap
              </p>
            </div>
            <span
              className="rounded-full px-2.5 py-1 text-xs font-semibold"
              style={
                isLive
                  ? { backgroundColor: "#DCFCE7", color: "#15803D" }
                  : { backgroundColor: `${brand.accent}`, color: "white" }
              }
            >
              {isLive
                ? "🎉 Live"
                : user.onboardingStage === "paused"
                  ? "Paused"
                  : `${doneCount}/${campaignSteps.length}`}
            </span>
          </div>

          <ol className="mt-5 space-y-1.5">
            {campaignSteps.map((step, i) => (
              <li
                key={step.label}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${
                  step.current ? "bg-white/10" : ""
                }`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                    step.done ? "text-white" : "text-white/50"
                  }`}
                  style={
                    step.done
                      ? { backgroundColor: brand.accent }
                      : step.current
                        ? { boxShadow: `inset 0 0 0 2px ${brand.accent}` }
                        : { boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.2)" }
                  }
                >
                  {step.done ? "✓" : i + 1}
                </span>
                <span
                  className={`text-sm ${
                    step.done
                      ? "text-white/80"
                      : step.current
                        ? "font-medium text-white"
                        : "text-white/50"
                  }`}
                >
                  {step.label}
                </span>
                {step.current && (
                  <span
                    className="ml-auto text-[11px] font-medium"
                    style={{ color: brand.accent }}
                  >
                    In progress
                  </span>
                )}
              </li>
            ))}
          </ol>

          {!isLive && (
            <Link
              href="/dashboard/grow"
              className="mt-4 inline-block text-xs font-medium text-white/60 hover:text-white"
            >
              Increase your ad spend →
            </Link>
          )}
        </div>

        {/* Leads per week — mini bar chart */}
        <div className={`${CARD} p-6 lg:col-span-2`}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold">Leads per week</h2>
              <p className="mt-0.5 text-xs text-gray-400">Last 6 weeks</p>
            </div>
            <p className="text-2xl font-semibold tracking-tight">
              {leads.length}
              <span className="ml-1 text-xs font-normal text-gray-400">
                total
              </span>
            </p>
          </div>
          <div className="mt-6 flex h-40 gap-3">
            {weekly.map((n, i) => {
              const last = i === weekly.length - 1;
              return (
                <div
                  key={i}
                  className="flex h-full flex-1 flex-col items-center gap-2"
                >
                  <div className="flex w-full flex-1 items-end">
                    <div
                      className="group relative w-full rounded-lg transition-all"
                      style={{
                        height: `${Math.max(4, (n / maxWeek) * 100)}%`,
                        backgroundColor: last ? brand.accent : brand.accentSoft,
                      }}
                      title={`${n} lead${n === 1 ? "" : "s"}`}
                    >
                      <span
                        className={`absolute -top-5 left-1/2 -translate-x-1/2 text-[11px] font-semibold ${
                          n === 0 ? "hidden" : ""
                        } ${last ? "" : "text-gray-500"}`}
                        style={last ? { color: brand.accent } : undefined}
                      >
                        {n}
                      </span>
                    </div>
                  </div>
                  <span className="text-[11px] text-gray-400">
                    {last ? "This wk" : `${weekly.length - 1 - i}w`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Current ad + spend */}
        <div className={`${CARD} p-6`}>
          <h2 className="font-semibold">Current ad</h2>
          <p className="mt-3 truncate text-sm font-medium text-gray-800">
            {topAd ?? "In production"}
          </p>
          <p className="text-xs text-gray-400">
            {topAd ? "Your best-running ad" : "Creatives being built"}
          </p>
          <div className="mt-5 rounded-xl bg-gray-50 p-4">
            <p className="text-xs text-gray-400">Monthly ad spend</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">
              £{pkg?.adSpend?.toLocaleString("en-GB")}
            </p>
            <p className="mt-1 text-[11px] text-gray-400">
              Live spend appears once Meta is linked
            </p>
          </div>
        </div>

        {/* Untouched / active clients */}
        <div className={`${CARD} p-6`}>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Untouched leads</h2>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
              {untouched.length}
            </span>
          </div>
          <div className="mt-4 space-y-2">
            {untouched.slice(0, 4).map((l) => (
              <Link
                key={l.id}
                href={`/dashboard/leads?lead=${l.id}`}
                className="flex items-center justify-between rounded-xl px-3 py-2 transition hover:bg-gray-50"
              >
                <span className="truncate text-sm font-medium text-gray-800">
                  {l.name}
                </span>
                <span className="ml-2 shrink-0 text-xs capitalize text-gray-400">
                  {l.source}
                </span>
              </Link>
            ))}
            {untouched.length === 0 && (
              <p className="py-6 text-center text-sm text-gray-400">
                Every lead&apos;s been actioned. 🎉
              </p>
            )}
          </div>
        </div>

        {/* Recent leads */}
        <div className={`${CARD} p-6`}>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Recent leads</h2>
            <Link
              href="/dashboard/leads"
              className="text-sm font-medium hover:underline"
              style={{ color: brand.accent }}
            >
              View all →
            </Link>
          </div>
          <div className="mt-4 divide-y divide-gray-100">
            {leads.slice(0, 4).map((lead) => (
              <Link
                key={lead.id}
                href={`/dashboard/leads?lead=${lead.id}`}
                className="flex items-center justify-between py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{lead.name}</p>
                  <p className="text-xs text-gray-400">
                    via {lead.source} ·{" "}
                    {new Date(lead.receivedAt).toLocaleDateString("en-GB")}
                  </p>
                </div>
                <span className="ml-2 shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium capitalize text-gray-600">
                  {lead.stage === "converted" || lead.stage === "pushed"
                    ? brand.conversionLabel
                    : lead.stage.replace("attempt", "Attempt ")}
                </span>
              </Link>
            ))}
            {leads.length === 0 && (
              <p className="py-6 text-center text-sm text-gray-400">
                Leads will appear here once your ads are live.
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
