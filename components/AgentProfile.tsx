"use client";

import { useState } from "react";
import { brandById } from "@/lib/brands";
import { packageById } from "@/lib/packages";
import { ONBOARDING_STAGES, stageIndex } from "@/lib/onboarding";
import type { UserProfile } from "@/lib/types";

// Admin CRM record for one agent — everything needed to launch and manage
// their ads: onboarding stage (movable), contact + location, tenure, spend,
// conversion, campaign ID, password reset and internal notes.

function tenure(iso: string): string {
  const start = new Date(iso).getTime();
  const days = Math.max(0, Math.floor((Date.now() - start) / 86400000));
  if (days < 1) return "Today";
  if (days === 1) return "1 day";
  if (days < 14) return `${days} days`;
  if (days < 60) return `${Math.round(days / 7)} weeks`;
  return `${Math.round(days / 30)} months`;
}

export default function AgentProfile({
  agent,
  summary,
  adminPassword,
  onClose,
  onUpdated,
}: {
  agent: UserProfile;
  summary?: { total: number; converted: number };
  adminPassword: string;
  onClose: () => void;
  onUpdated: (u: UserProfile) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [reset, setReset] = useState<string | null>(null);
  const brand = brandById(agent.brandId);
  const pkg = packageById(agent.packageId);
  const rate =
    summary && summary.total > 0
      ? Math.round((summary.converted / summary.total) * 100)
      : null;
  const curStage = stageIndex(agent.onboardingStage);

  async function patch(body: Record<string, unknown>) {
    setSaving(true);
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminPassword}`,
      },
      body: JSON.stringify({ userId: agent.id, ...body }),
    });
    setSaving(false);
    if (res.ok) {
      const { user } = await res.json();
      if (user) onUpdated(user);
      return user as UserProfile;
    }
    return null;
  }

  async function resetPassword() {
    const res = await fetch("/api/admin/reset-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminPassword}`,
      },
      body: JSON.stringify({ userId: agent.id }),
    });
    if (res.ok) setReset((await res.json()).temporaryPassword);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-gray-900/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="h-full w-full max-w-lg overflow-y-auto bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-gray-100 text-lg font-semibold text-gray-500">
              {agent.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={agent.photo} alt={agent.name} className="h-full w-full object-cover" />
              ) : (
                agent.name.charAt(0).toUpperCase()
              )}
            </div>
            <div>
              <h2 className="text-xl font-semibold">{agent.name}</h2>
              <p className="text-sm text-gray-500">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: brand?.accent }} />
                  {brand?.name}
                </span>
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100" aria-label="Close">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {/* Onboarding stage — click to move */}
        <div className="mt-6 rounded-2xl border border-gray-200 p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Onboarding stage</p>
            <button
              onClick={() =>
                patch({
                  onboardingStage:
                    agent.onboardingStage === "paused" ? "signed_up" : "paused",
                })
              }
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                agent.onboardingStage === "paused"
                  ? "bg-gray-900 text-white"
                  : "border border-gray-200 text-gray-500 hover:bg-gray-50"
              }`}
            >
              {agent.onboardingStage === "paused" ? "Paused" : "Pause"}
            </button>
          </div>
          <div className="mt-4 space-y-1.5">
            {ONBOARDING_STAGES.map((s, i) => {
              const done = i < curStage;
              const current = i === curStage && agent.onboardingStage !== "paused";
              return (
                <button
                  key={s.id}
                  onClick={() => patch({ onboardingStage: s.id })}
                  disabled={saving}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition ${
                    current ? "font-semibold" : "hover:bg-gray-50"
                  }`}
                >
                  <span
                    className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white"
                    style={{
                      backgroundColor: done || current ? brand?.accent : "#E5E7EB",
                    }}
                  >
                    {done ? "✓" : i + 1}
                  </span>
                  <span className={current ? "text-gray-900" : done ? "text-gray-600" : "text-gray-400"}>
                    {s.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Customer sign-off — their approval + any feedback */}
        {(agent.onboardingStage === "review" ||
          (agent.campaignFeedback ?? []).length > 0) && (
          <div
            className="mt-4 rounded-2xl border p-4"
            style={{
              borderColor: agent.campaignApproved ? "#86efac" : "#e5e7eb",
              backgroundColor: agent.campaignApproved ? "#f0fdf4" : undefined,
            }}
          >
            <p className="text-sm font-semibold">Customer sign-off</p>
            {agent.onboardingStage === "review" &&
              (agent.campaignApproved ? (
                <p className="mt-1 text-sm font-medium text-green-700">
                  ✅ Approved — you're clear to set them live.
                </p>
              ) : (
                <p className="mt-1 text-sm font-medium text-amber-600">
                  ⏳ Awaiting customer approval.
                </p>
              ))}
            {(agent.campaignFeedback ?? []).length > 0 && (
              <ul className="mt-3 space-y-2">
                {[...(agent.campaignFeedback ?? [])].reverse().map((f, i) => (
                  <li
                    key={i}
                    className="rounded-lg bg-white/70 p-3 text-sm text-gray-700"
                  >
                    “{f.text}”
                    <span className="mt-1 block text-xs text-gray-400">
                      {new Date(f.at).toLocaleString("en-GB")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Key facts */}
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Fact label="Signed up">
            {new Date(agent.createdAt).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </Fact>
          <Fact label="With us">{tenure(agent.createdAt)}</Fact>
          <Fact label="Package">
            {pkg?.name}{" "}
            <span className="text-gray-400">£{pkg?.price}/mo</span>
          </Fact>
          <Fact label="Ad spend">£{pkg?.adSpend}/mo</Fact>
          <Fact label="Leads">{summary?.total ?? 0}</Fact>
          <Fact label="Conversion">
            {rate === null ? "—" : `${rate}%`}
          </Fact>
        </div>

        {/* Contact + launch info */}
        <div className="mt-6 space-y-3">
          <ReadRow label="Email" value={agent.email} />
          <ReadRow label="Phone" value={agent.mobile || "—"} />
          <ReadRow
            label="Platforms"
            value={
              agent.platforms.map((p) => p[0].toUpperCase() + p.slice(1)).join(", ") ||
              "—"
            }
          />
          <ReadRow label="Goal" value={agent.goal || "—"} />
          <EditRow
            label="Location"
            defaultValue={agent.location ?? ""}
            placeholder="Town / patch"
            onSave={(v) => patch({ location: v })}
          />
          <EditRow
            label="Meta campaign ID"
            defaultValue={agent.metaCampaignId ?? ""}
            placeholder="Campaign ID"
            onSave={(v) => patch({ metaCampaignId: v })}
          />
        </div>

        {/* Reset password */}
        <div className="mt-6 rounded-2xl border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Password</p>
              <p className="text-xs text-gray-400">
                Issue a temporary password if they're locked out.
              </p>
            </div>
            <button
              onClick={resetPassword}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              Reset password
            </button>
          </div>
          {reset && (
            <div className="mt-3 rounded-lg bg-gray-50 p-3 text-center font-mono text-sm font-semibold">
              {reset}
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="mt-6">
          <p className="text-sm font-semibold">Notes</p>
          <div className="mt-3 flex gap-2">
            <input
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Add a note…"
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-900"
              onKeyDown={(e) => {
                if (e.key === "Enter" && noteText.trim()) {
                  patch({ note: noteText.trim() });
                  setNoteText("");
                }
              }}
            />
            <button
              onClick={() => {
                if (noteText.trim()) {
                  patch({ note: noteText.trim() });
                  setNoteText("");
                }
              }}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
            >
              Add
            </button>
          </div>
          <ol className="mt-4 space-y-3">
            {[...(agent.adminNotes ?? [])].reverse().map((n, i) => (
              <li key={i} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                <p className="text-sm text-gray-700">{n.text}</p>
                <p className="mt-1 text-xs text-gray-400">
                  {new Date(n.at).toLocaleString("en-GB")}
                </p>
              </li>
            ))}
            {(agent.adminNotes ?? []).length === 0 && (
              <li className="text-sm text-gray-400">No notes yet.</li>
            )}
          </ol>
        </div>
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 p-3">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-gray-800">{children}</p>
    </div>
  );
}

function ReadRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="text-gray-400">{label}</span>
      <span className="max-w-[65%] text-right font-medium text-gray-800">{value}</span>
    </div>
  );
}

function EditRow({
  label,
  defaultValue,
  placeholder,
  onSave,
}: {
  label: string;
  defaultValue: string;
  placeholder: string;
  onSave: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-gray-400">{label}</span>
      <input
        defaultValue={defaultValue}
        placeholder={placeholder}
        onBlur={(e) => {
          if (e.target.value !== defaultValue) onSave(e.target.value);
        }}
        className="w-40 rounded-lg border border-gray-200 px-2 py-1.5 text-right text-sm outline-none focus:border-gray-900"
      />
    </div>
  );
}
