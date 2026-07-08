"use client";

import { useEffect, useState } from "react";
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

export default function DashboardOverview() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  // Flips true just after mount so the progress bar animates up from empty.
  const [fillReady, setFillReady] = useState(false);
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
    const t = setTimeout(() => setFillReady(true), 200);
    return () => clearTimeout(t);
  }, []);

  if (!user || !brand) return null;

  const pkg = packageById(user.packageId);
  const converted = leads.filter(
    (l) => l.stage === "converted" || l.stage === "pushed"
  ).length;

  // Timeline driven by the admin-set onboarding stage.
  const curStage = stageIndex(user.onboardingStage);
  const isLive = user.onboardingStage === "live";
  const campaignSteps = ONBOARDING_STAGES.map((s, i) => ({
    label: s.label,
    done: i < curStage || isLive,
    current: i === curStage && !isLive && user.onboardingStage !== "paused",
  }));

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

      {/* Campaign status — progress fills up as each stage completes, with a
          confetti pop when the ads go live. */}
      <section className="relative mt-10 overflow-hidden rounded-2xl border border-gray-200 p-6 shadow-sm">
        <Confetti fire={isLive} />
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
            style={
              isLive
                ? { backgroundColor: "#DCFCE7", color: "#15803D" }
                : { backgroundColor: brand.accentSoft, color: brand.accent }
            }
          >
            {user.onboardingStage === "paused"
              ? "Paused"
              : isLive
                ? "🎉 Ads live"
                : "In preparation"}
          </span>
        </div>

        {/* Progress track + numbered nodes */}
        <div className="relative mx-1 mt-10">
          <div className="absolute inset-x-4 top-4 h-1.5 -translate-y-1/2 rounded-full bg-gray-100" />
          <div
            className="absolute left-4 top-4 h-1.5 -translate-y-1/2 rounded-full transition-[width] duration-[1100ms] ease-out"
            style={{
              width: fillReady
                ? `calc((100% - 2rem) * ${
                    (isLive ? ONBOARDING_STAGES.length - 1 : curStage) /
                    (ONBOARDING_STAGES.length - 1)
                  })`
                : "0px",
              backgroundColor: brand.accent,
            }}
          />
          <div className="relative flex justify-between">
            {campaignSteps.map((step, i) => (
              <div key={step.label} className="flex flex-col items-center">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-all duration-500 ${
                    step.done
                      ? "scale-100 text-white shadow-sm"
                      : step.current
                        ? "animate-pulse border-2 bg-white"
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
                  className={`mt-2 max-w-[6rem] text-center text-xs ${
                    step.done || step.current
                      ? "font-medium text-gray-700"
                      : "text-gray-400"
                  }`}
                >
                  {step.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {isLive ? (
          <p className="mt-8 rounded-xl bg-green-50 p-4 text-sm font-medium text-green-800">
            🎉 Your ads are live — leads will start dropping into your funnel.
            Nice work getting here.
          </p>
        ) : (
          <p className="mt-8 rounded-xl bg-gray-50 p-4 text-sm text-gray-500">
            Our team is preparing your ad creatives for{" "}
            <span className="font-medium text-gray-700">
              {user.platforms.join(" and ")}
            </span>{" "}
            based on your goal:{" "}
            <span className="font-medium text-gray-700">“{user.goal}”</span>.
            You'll see everything here as it's ready for review.
          </p>
        )}

        {/* Review & approve — the customer's final sign-off */}
        {user.onboardingStage === "review" && (
          <div
            className="mt-4 rounded-xl border p-4"
            style={{ borderColor: `${brand.accent}44` }}
          >
            {(user.campaignAssets ?? []).length > 0 && (
              <div className="mb-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
                  Your creatives
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
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
            {user.campaignApproved ? (
              <p className="text-sm font-medium text-green-700">
                ✓ Approved — we're putting your campaign live. You'll get a
                nudge here the moment it's up.
              </p>
            ) : (
              <>
                <p className="text-sm font-semibold text-gray-900">
                  Your creatives are ready to review
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  Happy with everything? Give it the final sign-off. Spotted
                  something — a typo, a colour, the wrong brand — pop it below
                  and we'll fix it before it goes live.
                </p>
                <textarea
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  rows={2}
                  placeholder="Any changes before we go live? (optional)"
                  className="mt-3 w-full rounded-xl border border-gray-200 p-3 text-sm outline-none focus:border-gray-900"
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
                    className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
                  >
                    Send feedback
                  </button>
                  {reviewStatus && (
                    <span className="text-xs text-gray-500">{reviewStatus}</span>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </section>

      {/* Stats */}
      <section className="mt-6 grid gap-4 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-gray-200 shadow-sm p-5">
            <p className="text-sm text-gray-500">{s.label}</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight">
              {s.value}
            </p>
            <p className="mt-1 text-xs text-gray-400">{s.note}</p>
          </div>
        ))}
      </section>

      {/* Recent leads */}
      <section className="mt-6 rounded-2xl border border-gray-200 shadow-sm p-6">
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
