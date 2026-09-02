"use client";

/* Ads — every agent in a business, what they're spending, and what it turns
 * into. Then the same per individual ad.
 *
 * Built for the marketing seat: Francesca could see that ads existed but not
 * what any one of them cost or produced. This is spend, leads, conversions
 * and cost-per-outcome per person and per creative, with a filter by person
 * so one agent's ads can be looked at on their own.
 *
 * Two numbers can disagree and the screen shows both on purpose:
 *   Meta leads  — what Meta counts as a lead (form submissions it saw)
 *   Leads       — what actually landed in the agent's funnel here
 * When they differ, that gap is itself the finding (routing, a form not
 * connected, a lead that went to someone else).
 */

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { packageById } from "@/lib/packages";

interface AdLine {
  adId: string | null;
  adName: string;
  status: string | null;
  imageUrl: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  metaLeads: number;
  leads: number;
  converted: number;
  cpl: number | null;
  costPerConversion: number | null;
  rate: number | null;
}

interface AgentLine {
  userId: string;
  name: string;
  email: string;
  packageId: string;
  campaignIds: string[];
  connected: boolean;
  spend: number;
  impressions: number;
  clicks: number;
  metaLeads: number;
  leads: number;
  converted: number;
  cpl: number | null;
  costPerConversion: number | null;
  rate: number | null;
  ads: AdLine[];
  error?: string;
}

interface Payload {
  preset: string;
  metaConnected: boolean;
  generatedAt: string;
  totals: {
    spend: number;
    leads: number;
    converted: number;
    connected: number;
    cpl: number | null;
    costPerConversion: number | null;
    rate: number | null;
  };
  agents: AgentLine[];
}

const PRESETS = [
  { id: "last_7d", label: "7 days" },
  { id: "last_30d", label: "30 days" },
  { id: "this_month", label: "This month" },
  { id: "last_90d", label: "90 days" },
];

const gbp = (n: number) =>
  n.toLocaleString("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: n < 100 ? 2 : 0 });
const money = (n: number | null) => (n === null ? "—" : gbp(n));
const pct = (n: number | null) => (n === null ? "—" : `${n}%`);

function Tile({
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
    <div className="rounded-2xl bg-gray-50 p-5">
      <p className="text-xs uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tracking-tight" style={accent ? { color: accent } : undefined}>
        {value}
      </p>
      {note && <p className="mt-1 text-xs text-gray-400">{note}</p>}
    </div>
  );
}

export default function BrandAds({
  token,
  brandId,
  accent,
  conversionLabel = "Converted",
}: {
  token: string;
  brandId: string;
  accent: string;
  /** The brand's own word for a conversion (Market Appraisal, Valuation…). */
  conversionLabel?: string;
}) {
  const [preset, setPreset] = useState("last_30d");
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [person, setPerson] = useState("all");
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(
    async (fresh = false) => {
      setLoading(true);
      setError("");
      try {
        const r = await fetch(
          `/api/admin/brand-ads?brandId=${encodeURIComponent(brandId)}&preset=${preset}${fresh ? "&fresh=1" : ""}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!r.ok) {
          setError("Couldn't load the ads.");
        } else {
          setData((await r.json()) as Payload);
        }
      } catch {
        setError("Couldn't reach the server.");
      }
      setLoading(false);
    },
    [brandId, preset, token]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const agents = useMemo(() => {
    const all = data?.agents ?? [];
    return person === "all" ? all : all.filter((a) => a.userId === person);
  }, [data, person]);

  // Totals follow the person filter, so picking someone shows THEIR numbers
  // in the tiles rather than the whole business's.
  const totals = useMemo(() => {
    if (person === "all" && data) return data.totals;
    const t = agents.reduce(
      (acc, a) => ({
        spend: acc.spend + a.spend,
        leads: acc.leads + a.leads,
        converted: acc.converted + a.converted,
        connected: acc.connected + (a.connected ? 1 : 0),
      }),
      { spend: 0, leads: 0, converted: 0, connected: 0 }
    );
    return {
      ...t,
      cpl: t.leads > 0 && t.spend > 0 ? Math.round((t.spend / t.leads) * 100) / 100 : null,
      costPerConversion:
        t.converted > 0 && t.spend > 0 ? Math.round((t.spend / t.converted) * 100) / 100 : null,
      rate: t.leads > 0 ? Math.round((t.converted / t.leads) * 100) : null,
    };
  }, [agents, data, person]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPreset(p.id)}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition ${
              preset === p.id ? "text-white" : "bg-gray-100 text-gray-600 hover:text-gray-900"
            }`}
            style={preset === p.id ? { background: accent } : undefined}
          >
            {p.label}
          </button>
        ))}
        <select
          value={person}
          onChange={(e) => setPerson(e.target.value)}
          className="max-w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 outline-none focus:border-gray-900"
        >
          <option value="all">Everyone</option>
          {(data?.agents ?? []).map((a) => (
            <option key={a.userId} value={a.userId}>
              {a.name}
              {a.connected ? "" : " (no ads connected)"}
            </option>
          ))}
        </select>
        <button
          onClick={() => void load(true)}
          className="ml-auto rounded-lg border border-gray-200 bg-white px-3.5 py-1.5 text-sm font-medium text-gray-500 transition hover:text-gray-900"
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {data && !data.metaConnected && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Meta isn&rsquo;t connected on this server, so spend and per-ad figures
          can&rsquo;t be shown — only what&rsquo;s landed in the funnel.
        </p>
      )}
      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Tile label="Ad spend" value={money(totals?.spend ?? 0)} note={PRESETS.find((p) => p.id === preset)?.label} />
        <Tile label="Leads" value={String(totals?.leads ?? 0)} note="Landed in the funnel" />
        <Tile label={conversionLabel} value={String(totals?.converted ?? 0)} note={`${pct(totals?.rate ?? null)} of leads`} accent={accent} />
        <Tile label="Cost per lead" value={money(totals?.cpl ?? null)} />
        <Tile label={`Cost per ${conversionLabel.toLowerCase()}`} value={money(totals?.costPerConversion ?? null)} />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
            <tr>
              <th className="px-5 py-3 font-medium">Agent</th>
              <th className="px-5 py-3 text-right font-medium">Spend</th>
              <th className="px-5 py-3 text-right font-medium">Meta leads</th>
              <th className="px-5 py-3 text-right font-medium">Leads</th>
              <th className="px-5 py-3 text-right font-medium">{conversionLabel}</th>
              <th className="px-5 py-3 text-right font-medium">Rate</th>
              <th className="px-5 py-3 text-right font-medium">Cost / lead</th>
              <th className="px-5 py-3 text-right font-medium">Ads</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {agents.map((a) => {
              const isOpen = open === a.userId;
              return (
                <Fragment key={a.userId}>
                  <tr
                    onClick={() => setOpen(isOpen ? null : a.userId)}
                    className={`cursor-pointer transition hover:bg-gray-50 ${isOpen ? "bg-gray-50" : ""}`}
                  >
                    <td className="px-5 py-3">
                      <p className="font-medium text-gray-800">{a.name}</p>
                      <p className="text-xs text-gray-400">
                        {packageById(a.packageId)?.name ?? a.packageId}
                        {a.connected
                          ? ` · ${a.campaignIds.length} campaign${a.campaignIds.length === 1 ? "" : "s"}`
                          : " · no ads connected"}
                        {a.error ? ` · ${a.error}` : ""}
                      </p>
                    </td>
                    <td className="px-5 py-3 text-right text-gray-800">{a.connected ? gbp(a.spend) : "—"}</td>
                    <td className="px-5 py-3 text-right text-gray-500">{a.connected ? a.metaLeads : "—"}</td>
                    <td className="px-5 py-3 text-right text-gray-800">{a.leads}</td>
                    <td className="px-5 py-3 text-right font-medium" style={{ color: accent }}>
                      {a.converted}
                    </td>
                    <td className="px-5 py-3 text-right text-gray-500">{pct(a.rate)}</td>
                    <td className="px-5 py-3 text-right text-gray-500">{money(a.cpl)}</td>
                    <td className="px-5 py-3 text-right text-gray-500">
                      {a.ads.length}
                      <span className="ml-2 text-xs text-gray-400">{isOpen ? "▲" : "▼"}</span>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={8} className="bg-gray-50 px-5 pb-4 pt-1">
                        {a.ads.length === 0 ? (
                          <p className="py-3 text-sm text-gray-400">No ads or leads to show for this period.</p>
                        ) : (
                          <table className="w-full text-left text-sm">
                            <thead className="text-[11px] uppercase tracking-wide text-gray-400">
                              <tr>
                                <th className="py-2 pr-3 font-medium">Ad</th>
                                <th className="py-2 pr-3 text-right font-medium">Spend</th>
                                <th className="py-2 pr-3 text-right font-medium">Reach</th>
                                <th className="py-2 pr-3 text-right font-medium">Clicks</th>
                                <th className="py-2 pr-3 text-right font-medium">Meta leads</th>
                                <th className="py-2 pr-3 text-right font-medium">Leads</th>
                                <th className="py-2 pr-3 text-right font-medium">{conversionLabel}</th>
                                <th className="py-2 pr-3 text-right font-medium">Rate</th>
                                <th className="py-2 pr-3 text-right font-medium">Cost / lead</th>
                                <th className="py-2 text-right font-medium">Cost / {conversionLabel.toLowerCase()}</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {a.ads.map((ad) => (
                                <tr key={ad.adId ?? ad.adName}>
                                  <td className="py-2 pr-3">
                                    <div className="flex items-center gap-2.5">
                                      {ad.imageUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={ad.imageUrl} alt="" className="h-9 w-9 shrink-0 rounded-md object-cover" />
                                      ) : (
                                        <span className="h-9 w-9 shrink-0 rounded-md bg-gray-200" />
                                      )}
                                      <div className="min-w-0">
                                        <p className="truncate font-medium text-gray-800" title={ad.adName}>
                                          {ad.adName}
                                        </p>
                                        <p className="text-[11px] text-gray-400">
                                          {ad.status
                                            ? ad.status.toLowerCase().replace(/_/g, " ")
                                            : "not in Meta any more"}
                                        </p>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="py-2 pr-3 text-right text-gray-800">{ad.adId ? gbp(ad.spend) : "—"}</td>
                                  <td className="py-2 pr-3 text-right text-gray-500">{ad.adId ? ad.impressions.toLocaleString("en-GB") : "—"}</td>
                                  <td className="py-2 pr-3 text-right text-gray-500">{ad.adId ? ad.clicks.toLocaleString("en-GB") : "—"}</td>
                                  <td className="py-2 pr-3 text-right text-gray-500">{ad.adId ? ad.metaLeads : "—"}</td>
                                  <td className="py-2 pr-3 text-right text-gray-800">{ad.leads}</td>
                                  <td className="py-2 pr-3 text-right font-medium" style={{ color: accent }}>{ad.converted}</td>
                                  <td className="py-2 pr-3 text-right text-gray-500">{pct(ad.rate)}</td>
                                  <td className="py-2 pr-3 text-right text-gray-500">{money(ad.cpl)}</td>
                                  <td className="py-2 text-right text-gray-500">{money(ad.costPerConversion)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {!loading && agents.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-10 text-center text-sm text-gray-400">
                  No agents in this business yet.
                </td>
              </tr>
            )}
            {loading && !data && (
              <tr>
                <td colSpan={8} className="px-5 py-10 text-center text-sm text-gray-400">
                  Pulling every agent&rsquo;s ads from Meta — this takes a few seconds the first time.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
