"use client";

import { useEffect, useMemo, useState } from "react";
import { getUser, fetchLeads, moveLeadStage } from "@/lib/session";
import { brandById, type Brand } from "@/lib/brands";
import { packageById } from "@/lib/packages";
import type { Lead, LeadStage } from "@/lib/types";

// Lead funnel. Progressive reveal: each stage only shows the next relevant
// actions. New → up to three contact attempts → (no answer) marketing funnel
// → convert (book the brand's success marker) → push to CRM.
//
// The "Push to CRM" action is a stub — the real REP/Atlas integration plugs
// into pushToCrm() below.

// Linear order used for the progress bar. `nurture` and `lost` sit off the
// main line and are handled separately.
const MAIN_ORDER: LeadStage[] = [
  "new",
  "attempt1",
  "attempt2",
  "attempt3",
  "converted",
  "pushed",
];

function stageLabel(stage: LeadStage, brand: Brand): string {
  switch (stage) {
    case "new":
      return "New";
    case "attempt1":
      return "Contact attempt 1";
    case "attempt2":
      return "Contact attempt 2";
    case "attempt3":
      return "Contact attempt 3";
    case "nurture":
      return "Marketing funnel";
    case "converted":
      return brand.conversionLabel;
    case "pushed":
      return `In ${brand.crmName}`;
    case "lost":
      return "Lost";
  }
}

type SortOrder = "newest" | "oldest";

export default function LeadsPage() {
  const [brand, setBrand] = useState<Brand | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [adSpend, setAdSpend] = useState(0);
  const [filter, setFilter] = useState<"active" | "all">("active");
  const [sort, setSort] = useState<SortOrder>("newest");
  const [toast, setToast] = useState("");

  useEffect(() => {
    const u = getUser();
    if (!u) return;
    setBrand(brandById(u.brandId) ?? null);
    setAdSpend(packageById(u.packageId)?.adSpend ?? 0);
    fetchLeads().then(setLeads);
  }, []);

  const visible = useMemo(() => {
    const base =
      filter === "all"
        ? leads
        : leads.filter((l) => l.stage !== "pushed" && l.stage !== "lost");
    return [...base].sort((a, b) => {
      const diff =
        new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime();
      return sort === "newest" ? diff : -diff;
    });
  }, [leads, filter, sort]);

  function update(leadId: string, stage: LeadStage) {
    // Optimistic update, then persist server-side; roll back on failure.
    const previous = leads;
    setLeads(
      leads.map((l) =>
        l.id === leadId
          ? {
              ...l,
              stage,
              history: [...l.history, { stage, at: new Date().toISOString() }],
            }
          : l
      )
    );
    moveLeadStage(leadId, stage).then((saved) => {
      if (!saved) {
        setLeads(previous);
        setToast("Couldn't save that — please try again");
        setTimeout(() => setToast(""), 3000);
      }
    });
  }

  function pushToCrm(lead: Lead) {
    if (!brand) return;
    // TODO(crm): call the brand's CRM API here (REP for property/lettings,
    // Atlas for recruitment). For now we just mark the lead as pushed.
    update(lead.id, "pushed");
    setToast(`${lead.name} sent to ${brand.crmName} ✓ (integration pending)`);
    setTimeout(() => setToast(""), 3500);
  }

  if (!brand) return null;

  // ── Headline stats ───────────────────────────────────────────────────
  const total = leads.length;
  const convertedCount = leads.filter(
    (l) => l.stage === "converted" || l.stage === "pushed"
  ).length;
  const costPerLead = total > 0 ? adSpend / total : null;
  const conversionRate = total > 0 ? Math.round((convertedCount / total) * 100) : 0;

  // ── Funnel summary (compact) ─────────────────────────────────────────
  const contacting = leads.filter((l) =>
    ["attempt1", "attempt2", "attempt3"].includes(l.stage)
  ).length;
  const summary = [
    { label: "New", count: leads.filter((l) => l.stage === "new").length },
    { label: "Contacting", count: contacting },
    {
      label: "Marketing funnel",
      count: leads.filter((l) => l.stage === "nurture").length,
    },
    { label: brand.conversionLabel, count: convertedCount },
    { label: `In ${brand.crmName}`, count: leads.filter((l) => l.stage === "pushed").length },
  ];

  return (
    <div className="w-full">
      <h1 className="text-3xl font-semibold tracking-tight">Leads</h1>
      <p className="mt-2 text-gray-500">
        Work every lead through your funnel — convert it, then push it
        straight into {brand.crmName}.
      </p>

      {/* Headline stats */}
      <div className="mt-8 grid gap-4 sm:grid-cols-4">
        <Stat label="Total leads" value={String(total)} />
        <Stat
          label="Cost per lead"
          value={costPerLead === null ? "—" : `£${costPerLead.toFixed(2)}`}
          note={`£${adSpend}/mo ad spend`}
        />
        <Stat
          label={brand.conversionLabel}
          value={String(convertedCount)}
          accent={brand.accent}
        />
        <Stat label="Conversion rate" value={`${conversionRate}%`} />
      </div>

      {/* Funnel summary */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {summary.map((f) => (
          <div
            key={f.label}
            className="rounded-xl border border-gray-200 p-4 text-center"
          >
            <p className="text-2xl font-semibold">{f.count}</p>
            <p className="mt-1 text-xs text-gray-500">{f.label}</p>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {(["active", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium capitalize transition ${
                filter === f
                  ? "bg-gray-900 text-white"
                  : "text-gray-500 hover:bg-gray-100"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-400">Sort</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOrder)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 font-medium text-gray-700 outline-none focus:border-gray-900"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </div>
      </div>

      {/* Lead cards */}
      <div className="mt-4 space-y-4">
        {visible.map((lead) => {
          const idx = MAIN_ORDER.indexOf(lead.stage);
          return (
            <div key={lead.id} className="rounded-2xl border border-gray-200 p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold">{lead.name}</h3>
                    <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium capitalize text-gray-600">
                      {lead.source}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(lead.receivedAt).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-500">
                    {lead.phone} · {lead.email}
                  </p>
                  {lead.note && (
                    <p className="mt-2 text-sm text-gray-600">“{lead.note}”</p>
                  )}
                </div>
                <span
                  className="shrink-0 rounded-full px-3 py-1 text-xs font-medium"
                  style={{
                    backgroundColor: brand.accentSoft,
                    color: brand.accent,
                  }}
                >
                  {stageLabel(lead.stage, brand)}
                </span>
              </div>

              {/* Stage stepper */}
              <div className="mt-5 flex items-center gap-1">
                {MAIN_ORDER.map((s, i) => (
                  <div
                    key={s}
                    className="h-1.5 flex-1 rounded-full"
                    style={{
                      backgroundColor:
                        lead.stage === "nurture"
                          ? i <= 3
                            ? brand.accent
                            : "#F3F4F6"
                          : i <= idx
                            ? brand.accent
                            : "#F3F4F6",
                    }}
                  />
                ))}
              </div>

              {/* Progressive actions */}
              <div className="mt-5 flex flex-wrap gap-2">
                {lead.stage === "new" && (
                  <ActionBtn onClick={() => update(lead.id, "attempt1")}>
                    Log contact attempt 1
                  </ActionBtn>
                )}
                {lead.stage === "attempt1" && (
                  <ActionBtn onClick={() => update(lead.id, "attempt2")}>
                    Log contact attempt 2
                  </ActionBtn>
                )}
                {lead.stage === "attempt2" && (
                  <ActionBtn onClick={() => update(lead.id, "attempt3")}>
                    Log contact attempt 3
                  </ActionBtn>
                )}
                {lead.stage === "attempt3" && (
                  <ActionBtn onClick={() => update(lead.id, "nurture")}>
                    Add to marketing funnel
                  </ActionBtn>
                )}

                {/* Convert is available at every working stage */}
                {["new", "attempt1", "attempt2", "attempt3", "nurture"].includes(
                  lead.stage
                ) && (
                  <button
                    onClick={() => update(lead.id, "converted")}
                    className="rounded-lg px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
                    style={{ backgroundColor: brand.accent }}
                  >
                    {brand.conversionVerb}
                  </button>
                )}

                {lead.stage === "converted" && (
                  <button
                    onClick={() => pushToCrm(lead)}
                    className="rounded-lg px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
                    style={{ backgroundColor: brand.accent }}
                  >
                    Push to {brand.crmName} →
                  </button>
                )}

                {lead.stage !== "pushed" && lead.stage !== "lost" && (
                  <button
                    onClick={() => update(lead.id, "lost")}
                    className="rounded-lg px-4 py-2 text-sm font-medium text-gray-400 transition hover:bg-gray-50 hover:text-gray-600"
                  >
                    Mark as lost
                  </button>
                )}
                {lead.stage === "pushed" && (
                  <span className="py-2 text-sm text-gray-400">
                    ✓ Pushed to {brand.crmName}
                  </span>
                )}
              </div>
            </div>
          );
        })}
        {visible.length === 0 && (
          <div className="rounded-2xl border border-dashed border-gray-200 py-16 text-center text-sm text-gray-400">
            No {filter === "active" ? "active " : ""}leads yet — they'll drop
            in here automatically once your ads are live.
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-gray-900 px-5 py-3 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  note,
  accent,
}: {
  label: string;
  value: string;
  note?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 p-5">
      <p className="text-sm text-gray-500">{label}</p>
      <p
        className="mt-2 text-3xl font-semibold tracking-tight"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </p>
      {note && <p className="mt-1 text-xs text-gray-400">{note}</p>}
    </div>
  );
}

function ActionBtn({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
    >
      {children}
    </button>
  );
}
