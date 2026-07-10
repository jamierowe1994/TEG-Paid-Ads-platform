"use client";

import { useEffect, useRef, useState } from "react";
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
  onLeadsImported,
}: {
  agent: UserProfile;
  summary?: { total: number; converted: number };
  adminPassword: string;
  onClose: () => void;
  onUpdated: (u: UserProfile) => void;
  onLeadsImported?: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [reset, setReset] = useState<string | null>(null);
  const [assetUrl, setAssetUrl] = useState("");
  const [assetType, setAssetType] = useState<"image" | "video">("image");
  const [assetCaption, setAssetCaption] = useState("");
  const [metaSearching, setMetaSearching] = useState(false);
  const [metaResult, setMetaResult] = useState<string | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [testLeadName, setTestLeadName] = useState("");
  const [testLeadPhone, setTestLeadPhone] = useState("");
  const [testLeadEmail, setTestLeadEmail] = useState("");
  const [addingLead, setAddingLead] = useState(false);
  const [addLeadResult, setAddLeadResult] = useState<string | null>(null);
  const [addLeadError, setAddLeadError] = useState<string | null>(null);
  // Campaign tags: each stored campaign id rendered as its own chip, verified
  // against Meta for its real name/status. Edit mode swaps the Active badge
  // for a Remove button on every chip.
  const [campaignTags, setCampaignTags] = useState<
    Array<{ id: string; name?: string; status?: string; error?: string }>
  >([]);
  const [newCampaignId, setNewCampaignId] = useState("");
  const [addingCampaign, setAddingCampaign] = useState(false);
  const [campaignsEditing, setCampaignsEditing] = useState(false);
  const [campaignsError, setCampaignsError] = useState<string | null>(null);
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagnosis, setDiagnosis] = useState<string[] | null>(null);
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

  async function addAsset(url: string, type: "image" | "video") {
    const asset = {
      id: Math.random().toString(36).slice(2, 10),
      url,
      type,
      caption: assetCaption.trim() || undefined,
      at: new Date().toISOString(),
    };
    await patch({ campaignAssets: [...(agent.campaignAssets ?? []), asset] });
    setAssetUrl("");
    setAssetCaption("");
  }
  function onUploadImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 3_000_000) {
      alert("Image too large — please keep uploads under 3MB (or paste a URL).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => addAsset(String(reader.result), "image");
    reader.readAsDataURL(file);
  }
  function removeAsset(id: string) {
    patch({
      campaignAssets: (agent.campaignAssets ?? []).filter((a) => a.id !== id),
    });
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

  // One-click historic backfill: pulls every Instant Form lead Meta still
  // holds for this agent's brand Page and creates them against this agent.
  // Safe to run again later — already-imported leads are skipped.
  async function findOlderLeads() {
    setMetaSearching(true);
    setMetaResult(null);
    setMetaError(null);
    const res = await fetch("/api/admin/meta/leadgen", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminPassword}`,
      },
      body: JSON.stringify({ brandId: agent.brandId, agentUserId: agent.id }),
    });
    const data = await res.json().catch(() => ({}));
    setMetaSearching(false);
    if (!res.ok) {
      setMetaError(data.error ?? "Couldn't reach Meta — please try again.");
      return;
    }
    if (data.imported === 0 && data.total === 0) {
      setMetaResult("No historic leads found on Meta for this business.");
    } else {
      setMetaResult(
        `Imported ${data.imported} lead${data.imported === 1 ? "" : "s"}${
          data.skipped ? ` · ${data.skipped} already here` : ""
        } from ${data.forms} form${data.forms === 1 ? "" : "s"} ✓`
      );
      onLeadsImported?.();
    }
  }

  // Manually add a lead straight into this agent's funnel — for seeding test
  // data or logging one that came in outside the usual channels.
  async function addTestLead() {
    const name = testLeadName.trim();
    if (!name) return;
    setAddingLead(true);
    setAddLeadResult(null);
    setAddLeadError(null);
    const res = await fetch("/api/admin/leads/add", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminPassword}`,
      },
      body: JSON.stringify({
        userId: agent.id,
        name,
        phone: testLeadPhone.trim(),
        email: testLeadEmail.trim(),
      }),
    });
    const data = await res.json().catch(() => ({}));
    setAddingLead(false);
    if (!res.ok) {
      setAddLeadError(data.error ?? "Couldn't add that lead.");
      return;
    }
    setAddLeadResult(`Added ${name} to ${agent.name.split(" ")[0]}'s leads ✓`);
    setTestLeadName("");
    setTestLeadPhone("");
    setTestLeadEmail("");
    onLeadsImported?.();
  }

  // Storage stays a comma-separated string on the profile; the UI treats
  // each id as its own tag.
  function parseIds(raw: string | null | undefined): string[] {
    return (raw ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  // The authoritative current id list. A ref (not the `agent` prop) so two
  // quick adds can't race — the prop only refreshes after each PATCH round-
  // trips, and reading it mid-flight could drop the previous add.
  const campaignIdsRef = useRef<string[]>(parseIds(agent.metaCampaignId));

  // Verify ids against Meta → real campaign names/statuses for the tags,
  // including the silent stats-killer: a campaign that verifies fine but
  // lives in a different ad account than this agent's brand pulls from.
  async function checkCampaigns(
    ids: string[]
  ): Promise<Array<{ id: string; name?: string; status?: string; error?: string }>> {
    if (ids.length === 0) return [];
    try {
      const res = await fetch("/api/admin/meta/campaign-check", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminPassword}`,
        },
        body: JSON.stringify({
          campaignIds: ids.join(", "),
          brandId: agent.brandId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data.campaigns)) return data.campaigns;
      // Verification unavailable (e.g. Meta not connected) — show bare ids.
      return ids.map((id) => ({ id, error: data.error ?? "Not verified" }));
    } catch {
      return ids.map((id) => ({ id, error: "Not verified" }));
    }
  }

  // Load the stored campaigns as verified tags whenever the record opens.
  useEffect(() => {
    let cancelled = false;
    const ids = parseIds(agent.metaCampaignId);
    campaignIdsRef.current = ids;
    if (ids.length === 0) {
      setCampaignTags([]);
      return;
    }
    setCampaignTags(ids.map((id) => ({ id }))); // instant bare tags…
    checkCampaigns(ids).then((tags) => {
      if (!cancelled) setCampaignTags(tags); // …then filled with names
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent.id]);

  // Add one campaign: append to the stored list, clear the box for the next
  // one, and verify the new id so its tag shows the real name.
  async function addCampaign() {
    const id = newCampaignId.trim().replace(/,+$/, "");
    if (!id || addingCampaign) return;
    setCampaignsError(null);
    const existing = campaignIdsRef.current;
    if (existing.includes(id)) {
      setCampaignsError("That campaign is already tagged.");
      return;
    }
    setAddingCampaign(true);
    const next = [...existing, id];
    const saved = await patch({ metaCampaignId: next.join(", ") });
    if (!saved) {
      setAddingCampaign(false);
      setCampaignsError("Couldn't save — please try again.");
      return;
    }
    campaignIdsRef.current = next;
    setNewCampaignId("");
    const [tag] = await checkCampaigns([id]);
    setCampaignTags((prev) => [...prev, tag ?? { id }]);
    setAddingCampaign(false);
  }

  // Run the full pipeline diagnostics — shows exactly what Meta says at each
  // step (campaign → its home account → that account's ads + insights), so a
  // token/permission gap can't hide behind a green tag and silent zeros.
  async function diagnoseCampaigns() {
    if (diagnosing) return;
    setDiagnosing(true);
    setDiagnosis(null);
    try {
      const res = await fetch("/api/admin/meta/agent-debug", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminPassword}`,
        },
        body: JSON.stringify({
          campaignIds: campaignIdsRef.current.join(", "),
          brandId: agent.brandId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.report) {
        setDiagnosis([`✕ ${data.error ?? "Diagnostics failed"}`]);
        return;
      }
      const r = data.report as {
        brandAccount: string | null;
        campaigns: Array<{
          id: string;
          name?: string;
          status?: string;
          accountId?: string;
          error?: string;
        }>;
        accounts: Array<{
          account: string;
          campaignIds: string[];
          accountName?: string;
          accountError?: string;
          adsFound?: number;
          adNames?: string[];
          adsError?: string;
          insightRows?: number;
          impressions?: number;
          spend?: number;
          insightsError?: string;
        }>;
      };
      const lines: string[] = [];
      lines.push(`Brand's configured ad account: ${r.brandAccount ?? "— none set"}`);
      for (const c of r.campaigns) {
        lines.push(
          c.error
            ? `✕ Campaign ${c.id}: ${c.error}`
            : `✓ Campaign "${c.name ?? c.id}" (${c.status ?? "?"}) lives in ${c.accountId ?? "unknown account"}`
        );
      }
      for (const a of r.accounts) {
        lines.push(
          a.accountError
            ? `✕ Account ${a.account}: can't read it — ${a.accountError}`
            : `✓ Account ${a.account} ("${a.accountName ?? "?"}") is readable`
        );
        lines.push(
          a.adsError
            ? `✕ Ads in ${a.account}: ${a.adsError}`
            : `${(a.adsFound ?? 0) > 0 ? "✓" : "✕"} Ads found: ${a.adsFound ?? 0}${a.adNames?.length ? ` — ${a.adNames.join(", ")}` : ""}`
        );
        lines.push(
          a.insightsError
            ? `✕ Stats in ${a.account}: ${a.insightsError}`
            : `${(a.insightRows ?? 0) > 0 ? "✓" : "✕"} Stats rows: ${a.insightRows ?? 0} (${(a.impressions ?? 0).toLocaleString()} impressions, £${(a.spend ?? 0).toFixed(2)} spend, last 30 days)`
        );
      }
      setDiagnosis(lines);
    } catch {
      setDiagnosis(["✕ Diagnostics failed — please try again."]);
    } finally {
      setDiagnosing(false);
    }
  }

  // Remove one campaign from the stored list (via Edit mode on its tag).
  async function removeCampaign(id: string) {
    const remaining = campaignIdsRef.current.filter((x) => x !== id);
    const saved = await patch({ metaCampaignId: remaining.join(", ") });
    if (!saved) {
      setCampaignsError("Couldn't remove — please try again.");
      return;
    }
    campaignIdsRef.current = remaining;
    setCampaignTags((prev) => prev.filter((t) => t.id !== id));
    if (remaining.length === 0) setCampaignsEditing(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4 backdrop-blur-sm sm:p-8"
      onClick={onClose}
    >
      <div
        className="modal-pop max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl sm:p-8"
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

        {/* Two columns on the big modal: pipeline/tools left, campaign +
            detail right. Stacks back to one column on smaller screens. */}
        <div className="mt-2 grid items-start gap-x-6 lg:grid-cols-2">
        <div>
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

        {/* Historic Meta leads — one-click backfill for this agent */}
        <div className="mt-4 rounded-2xl border border-gray-200 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Historic leads</p>
              <p className="mt-0.5 text-xs text-gray-400">
                Pull any leads Meta still holds for {brand?.name ?? "this business"}
                &apos;s Instant Form ads into {agent.name.split(" ")[0]}&apos;s
                account.
              </p>
            </div>
            <button
              onClick={findOlderLeads}
              disabled={metaSearching}
              className="shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              {metaSearching ? "Searching Meta…" : "Find older leads"}
            </button>
          </div>
          {metaResult && (
            <p className="mt-2.5 text-sm font-medium text-green-700">
              {metaResult}
            </p>
          )}
          {metaError && (
            <p className="mt-2.5 text-sm text-red-600">
              {metaError}{" "}
              {/No Meta Page configured/.test(metaError) && (
                <>— add a Page ID for {brand?.name} in Connections first.</>
              )}
            </p>
          )}
        </div>

        {/* Add a test lead — seed data for a fresh account, or log one that
            came in outside the usual channels */}
        <div className="mt-4 rounded-2xl border border-gray-200 p-4">
          <p className="text-sm font-semibold">Add a lead</p>
          <p className="mt-0.5 text-xs text-gray-400">
            Drops straight into {agent.name.split(" ")[0]}&apos;s Leads funnel
            as a new enquiry.
          </p>
          <div className="mt-3 space-y-2">
            <input
              value={testLeadName}
              onChange={(e) => setTestLeadName(e.target.value)}
              placeholder="Lead name"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-900"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                value={testLeadPhone}
                onChange={(e) => setTestLeadPhone(e.target.value)}
                placeholder="Phone (optional)"
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-900"
              />
              <input
                value={testLeadEmail}
                onChange={(e) => setTestLeadEmail(e.target.value)}
                placeholder="Email (optional)"
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-900"
              />
            </div>
            <button
              onClick={addTestLead}
              disabled={!testLeadName.trim() || addingLead}
              className="w-full rounded-lg bg-gray-900 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
            >
              {addingLead ? "Adding…" : "Add lead"}
            </button>
          </div>
          {addLeadResult && (
            <p className="mt-2.5 text-sm font-medium text-green-700">
              {addLeadResult}
            </p>
          )}
          {addLeadError && (
            <p className="mt-2.5 text-sm text-red-600">{addLeadError}</p>
          )}
        </div>
        </div>

        <div>
        {/* Meta campaigns — the main thing once ads are LIVE. Supports several
            at once (comma-separated), since agents can run multiple campaigns. */}
        {agent.onboardingStage === "live" && (
          <div className="mt-6 rounded-2xl border-2 border-gray-900 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Meta campaigns</p>
                <p className="mt-0.5 text-xs text-gray-400">
                  Add each campaign this agent&apos;s ads run under — they can
                  have several live at once.
                </p>
              </div>
              {campaignTags.length > 0 && (
                <button
                  onClick={() => setCampaignsEditing((v) => !v)}
                  className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium ${
                    campaignsEditing
                      ? "bg-gray-900 text-white"
                      : "border border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {campaignsEditing ? "Done" : "Edit"}
                </button>
              )}
            </div>

            {/* One tag per campaign — green when verified against Meta. In
                Edit mode the Active badge slides over to a Remove button. */}
            {campaignTags.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {campaignTags.map((c) => (
                  <li
                    key={c.id}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                      c.error
                        ? "bg-red-50 text-red-700"
                        : "bg-green-50 text-green-800"
                    }`}
                  >
                    {c.error ? (
                      <>
                        ✕{" "}
                        <span className="font-mono text-xs">{c.id}</span>
                        <span className="truncate text-xs">— {c.error}</span>
                      </>
                    ) : (
                      <>
                        ✓{" "}
                        <span className="truncate font-medium">
                          {c.name ?? c.id}
                        </span>
                      </>
                    )}
                    {campaignsEditing ? (
                      <button
                        onClick={() => removeCampaign(c.id)}
                        className="ml-auto shrink-0 rounded-full bg-red-600 px-2.5 py-0.5 text-[11px] font-semibold text-white hover:bg-red-700"
                      >
                        Remove
                      </button>
                    ) : (
                      <span
                        className={`ml-auto shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                          c.error
                            ? "bg-red-100 text-red-600"
                            : "bg-green-600 text-white"
                        }`}
                      >
                        {c.error ? "Unverified" : (c.status ?? "Active")}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {/* Add another — clears itself after each add */}
            <div className="mt-3 flex gap-2">
              <input
                value={newCampaignId}
                onChange={(e) => setNewCampaignId(e.target.value)}
                placeholder="Campaign ID, e.g. 1201234567890"
                className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-900"
                onKeyDown={(e) => e.key === "Enter" && addCampaign()}
              />
              <button
                onClick={addCampaign}
                disabled={addingCampaign || !newCampaignId.trim()}
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
              >
                {addingCampaign ? "Adding…" : "Add"}
              </button>
            </div>
            {campaignsError && (
              <p className="mt-2.5 text-sm text-red-600">{campaignsError}</p>
            )}

            {/* Diagnose — the raw truth from Meta when a green tag still
                shows zeros on the customer side */}
            {campaignTags.length > 0 && (
              <div className="mt-3">
                <button
                  onClick={diagnoseCampaigns}
                  disabled={diagnosing}
                  className="text-xs font-medium text-gray-400 underline decoration-dotted underline-offset-2 hover:text-gray-600 disabled:opacity-50"
                >
                  {diagnosing
                    ? "Asking Meta…"
                    : "Stats not showing? Run diagnostics"}
                </button>
                {diagnosis && (
                  <ul className="mt-2 space-y-1 rounded-lg bg-gray-50 p-3">
                    {diagnosis.map((line, i) => (
                      <li
                        key={i}
                        className={`text-xs ${
                          line.startsWith("✕")
                            ? "text-red-600"
                            : line.startsWith("✓")
                              ? "text-green-700"
                              : "text-gray-500"
                        }`}
                      >
                        {line}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        {/* Ad creatives — progressive with the onboarding stage:
            production = a "being built" note, review = the full uploader
            (the customer just sees them, no sign-off), live = folded away
            into a dropdown so the campaign IDs above take the spotlight. */}
        {agent.onboardingStage === "creatives" && (
          <div className="mt-4 rounded-2xl border border-dashed border-gray-300 p-4">
            <p className="text-sm font-semibold">Ad creatives</p>
            <p className="mt-0.5 text-xs text-gray-400">
              In production — the customer sees "we're working on them". Move
              the stage to <strong>Campaign review</strong> to upload the
              finished creatives.
            </p>
          </div>
        )}
        {agent.onboardingStage === "review" && (
          <div className="mt-4 rounded-2xl border border-gray-200 p-4">
            <p className="text-sm font-semibold">Ad creatives</p>
            <p className="mt-0.5 text-xs text-gray-400">
              These show on the customer's dashboard for them to see — no
              sign-off needed from them.
            </p>
            <CreativesBody
              agent={agent}
              saving={saving}
              assetUrl={assetUrl}
              setAssetUrl={setAssetUrl}
              assetType={assetType}
              setAssetType={setAssetType}
              assetCaption={assetCaption}
              setAssetCaption={setAssetCaption}
              onUploadImage={onUploadImage}
              addAsset={addAsset}
              removeAsset={removeAsset}
            />
          </div>
        )}
        {agent.onboardingStage === "live" && (
          <details className="mt-4 rounded-2xl border border-gray-200 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-gray-600">
              Ad creatives ({(agent.campaignAssets ?? []).length}) — campaign
              live
            </summary>
            <CreativesBody
              agent={agent}
              saving={saving}
              assetUrl={assetUrl}
              setAssetUrl={setAssetUrl}
              assetType={assetType}
              setAssetType={setAssetType}
              assetCaption={assetCaption}
              setAssetCaption={setAssetCaption}
              onUploadImage={onUploadImage}
              addAsset={addAsset}
              removeAsset={removeAsset}
            />
          </details>
        )}

        {/* Customer feedback — shown whenever they've sent any (no approval
            flow: the customer just sees the creatives, they don't sign off) */}
        {(agent.campaignFeedback ?? []).length > 0 && (
          <div className="mt-4 rounded-2xl border border-gray-200 p-4">
            <p className="text-sm font-semibold">Customer feedback</p>
            <ul className="mt-3 space-y-2">
              {[...(agent.campaignFeedback ?? [])].reverse().map((f, i) => (
                <li
                  key={i}
                  className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700"
                >
                  “{f.text}”
                  <span className="mt-1 block text-xs text-gray-400">
                    {new Date(f.at).toLocaleString("en-GB")}
                  </span>
                </li>
              ))}
            </ul>
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
            label="Rex user ID"
            defaultValue={agent.rexUserId ?? ""}
            placeholder="Auto-matched by email"
            onSave={(v) => patch({ rexUserId: v })}
          />
        </div>
        </div>
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

        {/* Reset password — deliberately last, and red: it's the one action
            here you don't want hit by accident. */}
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-red-700">Password</p>
              <p className="text-xs text-red-400">
                Issue a temporary password if they&apos;re locked out.
              </p>
            </div>
            <button
              onClick={resetPassword}
              className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100"
            >
              Reset password
            </button>
          </div>
          {reset && (
            <div className="mt-3 rounded-lg bg-white p-3 text-center font-mono text-sm font-semibold">
              {reset}
            </div>
          )}
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

// The creatives gallery + upload controls — shared between the review stage
// (full card) and the live stage (folded into a dropdown).
function CreativesBody({
  agent,
  saving,
  assetUrl,
  setAssetUrl,
  assetType,
  setAssetType,
  assetCaption,
  setAssetCaption,
  onUploadImage,
  addAsset,
  removeAsset,
}: {
  agent: UserProfile;
  saving: boolean;
  assetUrl: string;
  setAssetUrl: (v: string) => void;
  assetType: "image" | "video";
  setAssetType: (v: "image" | "video") => void;
  assetCaption: string;
  setAssetCaption: (v: string) => void;
  onUploadImage: (e: React.ChangeEvent<HTMLInputElement>) => void;
  addAsset: (url: string, type: "image" | "video") => void;
  removeAsset: (id: string) => void;
}) {
  return (
    <>
      {(agent.campaignAssets ?? []).length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {(agent.campaignAssets ?? []).map((a) => (
            <div key={a.id} className="group relative">
              {a.type === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={a.url}
                  alt={a.caption ?? "Creative"}
                  className="aspect-square w-full rounded-lg border border-gray-200 object-cover"
                />
              ) : (
                <div className="flex aspect-square w-full items-center justify-center rounded-lg border border-gray-200 bg-gray-900 text-xs font-medium text-white">
                  ▶ Video
                </div>
              )}
              <button
                onClick={() => removeAsset(a.id)}
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-gray-900 text-xs text-white shadow"
                aria-label="Remove"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 space-y-2">
        <label className="flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-gray-300 py-3 text-sm font-medium text-gray-500 hover:bg-gray-50">
          Upload an image
          <input type="file" accept="image/*" onChange={onUploadImage} className="hidden" />
        </label>
        <div className="flex gap-2">
          <input
            value={assetUrl}
            onChange={(e) => setAssetUrl(e.target.value)}
            placeholder="…or paste an image / video URL"
            className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-900"
          />
          <select
            value={assetType}
            onChange={(e) => setAssetType(e.target.value as "image" | "video")}
            className="rounded-lg border border-gray-200 px-2 text-sm outline-none focus:border-gray-900"
          >
            <option value="image">Image</option>
            <option value="video">Video</option>
          </select>
        </div>
        <input
          value={assetCaption}
          onChange={(e) => setAssetCaption(e.target.value)}
          placeholder="Caption (optional)"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-900"
        />
        <button
          onClick={() => assetUrl.trim() && addAsset(assetUrl.trim(), assetType)}
          disabled={!assetUrl.trim() || saving}
          className="w-full rounded-lg bg-gray-900 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
        >
          Add creative from URL
        </button>
      </div>
    </>
  );
}
