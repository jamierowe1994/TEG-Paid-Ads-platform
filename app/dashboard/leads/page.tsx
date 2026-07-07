"use client";

import { useEffect, useMemo, useState } from "react";
import { getUser, getLeads, saveLeads } from "@/lib/session";
import { brandById, type Brand } from "@/lib/brands";
import type { Lead, LeadStage } from "@/lib/types";

// Lead funnel. Each lead moves: New → Attempt 1 → Attempt 2 → Converted
// → Pushed to CRM. The "Push to CRM" action is a stub — the real REP/Atlas
// integration plugs into pushToCrm() below.

const STAGE_ORDER: LeadStage[] = ["new", "attempt1", "attempt2", "converted", "pushed"];

function stageLabel(stage: LeadStage, brand: Brand): string {
  switch (stage) {
    case "new":
      return "New";
    case "attempt1":
      return "Contact attempt 1";
    case "attempt2":
      return "Contact attempt 2";
    case "converted":
      return brand.conversionLabel;
    case "pushed":
      return `In ${brand.crmName}`;
    case "lost":
      return "Lost";
  }
}

export default function LeadsPage() {
  const [brand, setBrand] = useState<Brand | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [filter, setFilter] = useState<"active" | "all">("active");
  const [toast, setToast] = useState("");

  useEffect(() => {
    const u = getUser();
    if (!u) return;
    setBrand(brandById(u.brandId) ?? null);
    setLeads(getLeads());
  }, []);

  const visible = useMemo(
    () =>
      filter === "all"
        ? leads
        : leads.filter((l) => l.stage !== "pushed" && l.stage !== "lost"),
    [leads, filter]
  );

  function update(leadId: string, stage: LeadStage) {
    const next = leads.map((l) =>
      l.id === leadId
        ? {
            ...l,
            stage,
            history: [...l.history, { stage, at: new Date().toISOString() }],
          }
        : l
    );
    setLeads(next);
    saveLeads(next);
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

  const funnelCounts = STAGE_ORDER.map((s) => ({
    stage: s,
    count: leads.filter((l) => l.stage === s).length,
  }));

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-3xl font-semibold tracking-tight">Leads</h1>
      <p className="mt-2 text-gray-500">
        Work every lead through your funnel — convert it, then push it
        straight into {brand.crmName}.
      </p>

      {/* Funnel summary */}
      <div className="mt-8 grid grid-cols-5 gap-3">
        {funnelCounts.map((f) => (
          <div
            key={f.stage}
            className="rounded-xl border border-gray-200 p-4 text-center"
          >
            <p className="text-2xl font-semibold">{f.count}</p>
            <p className="mt-1 text-xs text-gray-500">
              {stageLabel(f.stage, brand)}
            </p>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="mt-8 flex gap-2">
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

      {/* Lead cards */}
      <div className="mt-4 space-y-4">
        {visible.map((lead) => {
          const idx = STAGE_ORDER.indexOf(lead.stage);
          return (
            <div key={lead.id} className="rounded-2xl border border-gray-200 p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold">{lead.name}</h3>
                    <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium capitalize text-gray-600">
                      {lead.source}
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
                {STAGE_ORDER.map((s, i) => (
                  <div
                    key={s}
                    className="h-1.5 flex-1 rounded-full"
                    style={{
                      backgroundColor: i <= idx ? brand.accent : "#F3F4F6",
                    }}
                  />
                ))}
              </div>

              {/* Actions */}
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
                {(lead.stage === "new" ||
                  lead.stage === "attempt1" ||
                  lead.stage === "attempt2") && (
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
