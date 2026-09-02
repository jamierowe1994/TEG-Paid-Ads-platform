"use client";

/* WhatsApp monitoring — "are the lead alerts actually going out, and how
 * fast?" Built after agents reported alerts arriving late, when there was no
 * way to tell whether that was true or where the time went.
 *
 * The screen is careful about one distinction, because getting it wrong is
 * how a monitoring tool lies: Meta ACCEPTING a message is not the same as it
 * ARRIVING. Everything here says "sent" only in the accepted sense, and real
 * delivery numbers appear only once Meta's status webhook is wired up.
 *
 * The wait time is measured from the lead's own submission timestamp, so it
 * includes the five-minute lead poll. That's deliberate — it's the number the
 * agent experiences, and it's where nearly all the delay actually is.
 */

import { useCallback, useEffect, useState } from "react";
import { brandById } from "@/lib/brands";

interface Entry {
  id: string;
  sentAt: string;
  kind: string;
  userId: string | null;
  agentName: string;
  brandId: string | null;
  leadId: string | null;
  leadName: string;
  template: string;
  dynamic: boolean;
  fellBack: boolean;
  ok: boolean;
  reason: string | null;
  toMasked: string;
  leadReceivedAt: string | null;
  latencyMs: number | null;
  apiMs: number | null;
  deliveredAt: string | null;
  readAt: string | null;
  failedAt: string | null;
  failDetail: string | null;
}

interface Summary {
  windowDays: number;
  attempted: number;
  accepted: number;
  failed: number;
  reasons: { reason: string; count: number }[];
  medianLatencyMs: number | null;
  p90LatencyMs: number | null;
  worstLatencyMs: number | null;
  slow: number;
  deliveryKnown: boolean;
  delivered: number;
  read: number;
  bounced: number;
  fellBack: number;
  byDay: { day: string; sent: number; failed: number; medianLatencyMs: number | null }[];
}

interface Payload {
  status: {
    configured: boolean;
    ok?: boolean;
    number?: string;
    name?: string;
    verified?: boolean;
    template?: string;
    deepLink?: boolean;
    error?: string;
  };
  summary: Summary;
  today: Summary;
  entries: Entry[];
  deliveryWebhook: boolean;
}

const WINDOWS = [
  { days: 1, label: "Last 24 hours" },
  { days: 7, label: "Last 7 days" },
  { days: 30, label: "Last 30 days" },
];

// Anything past this is worth a look; it's also the threshold the API counts.
const SLOW_MS = 15 * 60 * 1000;

function duration(ms: number | null): string {
  if (ms === null || Number.isNaN(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return rem ? `${m}m ${rem}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

/* Meta's error text is written for developers. These are the ones that
   actually happen, in words that say what to DO about them. Anything
   unrecognised is shown raw rather than guessed at. */
function explain(reason: string): string | null {
  const r = reason.toLowerCase();
  if (r.includes("no mobile number"))
    return "Their account has no mobile number, so there was nothing to send to. Add it on their agent record.";
  if (r.includes("not a usable mobile"))
    return "The number on their account isn't a valid UK mobile. Check it on their agent record.";
  if (r.includes("access token") || r.includes("session has expired") || r.includes("code 190"))
    return "The WhatsApp token has expired. Generate a new permanent token in Meta and update WHATSAPP_TOKEN in Railway.";
  if (r.includes("template") && (r.includes("not exist") || r.includes("not found")))
    return "The template name doesn't match anything approved in Meta. Check the name and language (en_GB).";
  if (r.includes("paused") || r.includes("disabled"))
    return "Meta has paused this template, usually for low quality. It needs re-approval before alerts resume.";
  if (r.includes("re-engagement") || r.includes("24 hour") || r.includes("24-hour"))
    return "Meta refused a free-form message outside the 24-hour window. Alerts must use an approved template.";
  if (r.includes("rate") || r.includes("limit"))
    return "Meta rate-limited us. These usually clear on their own; if it persists the number's messaging tier needs raising.";
  if (r.includes("recipient") || r.includes("not a whatsapp"))
    return "That number isn't on WhatsApp. They'll only get push notifications until it's corrected.";
  return null;
}

function Stat({
  label,
  value,
  note,
  tone = "plain",
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "plain" | "good" | "bad" | "warn";
}) {
  const colour =
    tone === "bad"
      ? "text-red-600"
      : tone === "warn"
        ? "text-amber-600"
        : tone === "good"
          ? "text-emerald-600"
          : "text-gray-900";
  return (
    <div className="rounded-2xl bg-gray-50 p-5">
      <p className="text-xs uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`mt-1.5 text-2xl font-semibold tracking-tight ${colour}`}>
        {value}
      </p>
      {note && <p className="mt-1 text-xs text-gray-400">{note}</p>}
    </div>
  );
}

export default function WhatsAppMonitor({ pass }: { pass: string }) {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [onlyProblems, setOnlyProblems] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/whatsapp/log?days=${days}`, {
        headers: { Authorization: `Bearer ${pass}` },
      });
      if (!res.ok) {
        setError("Couldn't load the WhatsApp log.");
        setLoading(false);
        return;
      }
      setData((await res.json()) as Payload);
    } catch {
      setError("Couldn't reach the server.");
    }
    setLoading(false);
  }, [days, pass]);

  useEffect(() => {
    void load();
  }, [load]);

  const s = data?.summary;
  const rows = (data?.entries ?? []).filter((e) =>
    onlyProblems ? !e.ok || e.fellBack || (e.latencyMs ?? 0) > SLOW_MS : true
  );

  return (
    <div className="space-y-8">
      {/* ── Is the connection even alive? ─────────────────────────────────
          An empty log means one of two very different things, and this strip
          is what tells them apart. */}
      <section
        className={`rounded-2xl border p-5 ${
          !data
            ? "border-gray-100 bg-gray-50"
            : data.status.ok
              ? "border-emerald-200 bg-emerald-50"
              : "border-red-200 bg-red-50"
        }`}
      >
        {!data ? (
          <p className="text-sm text-gray-400">
            {loading ? "Checking WhatsApp…" : (error || "No data yet.")}
          </p>
        ) : !data.status.configured ? (
          <p className="text-sm text-red-900">
            WhatsApp isn&rsquo;t configured on this server — no alerts are going
            out at all. WHATSAPP_TOKEN and WHATSAPP_PHONE_ID need setting in
            Railway.
          </p>
        ) : data.status.ok ? (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span className="flex items-center gap-2 font-medium text-emerald-900">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Connected
            </span>
            <span className="text-emerald-800/80">
              {data.status.name} · {data.status.number}
            </span>
            <span className="text-emerald-800/80">
              Template: <strong className="font-medium">{data.status.template}</strong>
              {data.status.deepLink ? " (opens the lead)" : " (no deep link)"}
            </span>
            {!data.status.verified && (
              <span className="text-amber-700">Number not verified in Meta</span>
            )}
          </div>
        ) : (
          <div className="text-sm text-red-900">
            <p className="font-medium">
              WhatsApp is refusing us — alerts are not going out.
            </p>
            <p className="mt-1 text-red-800/80">{data.status.error}</p>
          </div>
        )}
      </section>

      {/* ── Window picker ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {WINDOWS.map((w) => (
            <button
              key={w.days}
              onClick={() => setDays(w.days)}
              className={`rounded-lg border px-3.5 py-1.5 text-sm font-medium transition ${
                days === w.days
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-200 bg-white text-gray-600 hover:text-gray-900"
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
        {/* The admin top bar already has a Refresh on a phone, where this one
            only wraps onto its own line. */}
        <button
          onClick={() => void load()}
          className="hidden rounded-lg border border-gray-200 bg-white px-3.5 py-1.5 text-sm font-medium text-gray-500 transition hover:text-gray-900 sm:block"
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {/* ── The numbers ── */}
      {s && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Stat
            label="Alerts sent"
            value={String(s.accepted)}
            note={`${data!.today.accepted} in the last 24 hours`}
          />
          <Stat
            label="Failed"
            value={String(s.failed)}
            tone={s.failed > 0 ? "bad" : "good"}
            note={s.failed > 0 ? "Nobody got these" : "None — good"}
          />
          <Stat
            label="Typical wait"
            value={duration(s.medianLatencyMs)}
            tone={
              s.medianLatencyMs !== null && s.medianLatencyMs > SLOW_MS
                ? "warn"
                : "plain"
            }
            note="Lead submitted → WhatsApp sent"
          />
          <Stat
            label="Slowest 1 in 10"
            value={duration(s.p90LatencyMs)}
            note={`Worst: ${duration(s.worstLatencyMs)}`}
          />
          <Stat
            label="Took over 15 min"
            value={String(s.slow)}
            tone={s.slow > 0 ? "warn" : "good"}
            note="Alerts an agent would call late"
          />
        </div>
      )}

      {/* ── What the wait is made of. The single most useful thing on this
             screen: nearly all of the delay is the lead poll, not WhatsApp,
             and without saying so the obvious conclusion is the wrong one. ── */}
      {s && s.medianLatencyMs !== null && (
        <section className="rounded-2xl bg-gray-50 p-5">
          <h3 className="text-sm font-semibold text-gray-900">
            Where the wait comes from
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            A lead sits with Meta until our next check, which runs every five
            minutes. So a typical alert is a few minutes old before we&rsquo;ve
            even seen it — that&rsquo;s the bulk of the {duration(s.medianLatencyMs)}{" "}
            above, and WhatsApp itself takes well under a second.
          </p>
          <p className="mt-2 text-sm text-gray-500">
            {s.medianLatencyMs > SLOW_MS
              ? "Right now it's well beyond that, which points at the lead sync rather than WhatsApp — worth checking the Connections tab."
              : "That's in the expected range. If agents still say it feels slow, the honest answer is the five-minute check, not a fault."}
          </p>
        </section>
      )}

      {/* ── Failures, with what to do about each ── */}
      {s && s.reasons.length > 0 && (
        <section className="rounded-2xl border border-red-200 bg-red-50 p-5">
          <h3 className="text-sm font-semibold text-red-900">
            Why alerts failed{" "}
            <span className="font-normal text-red-700/70">{s.failed}</span>
          </h3>
          <ul className="mt-3 space-y-3">
            {s.reasons.map((r) => {
              const plain = explain(r.reason);
              return (
                <li key={r.reason} className="rounded-xl bg-white/70 px-4 py-3">
                  <p className="text-sm font-medium text-gray-900">
                    {plain ?? r.reason}{" "}
                    <span className="font-normal text-gray-400">× {r.count}</span>
                  </p>
                  {plain && (
                    <p className="mt-1 text-xs text-gray-500">
                      Meta&rsquo;s wording: {r.reason}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ── Deep-link fallbacks: arrived, but without the button ── */}
      {s && s.fellBack > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm">
          <p className="font-medium text-amber-900">
            {s.fellBack} alert{s.fellBack === 1 ? "" : "s"} went out without the
            &ldquo;open this lead&rdquo; button
          </p>
          <p className="mt-1 text-amber-800/80">
            Meta rejected the deep-link template and we sent the plain one
            instead, so the agent got the message but has to find the lead
            themselves. Usually means the template was edited or paused.
          </p>
        </section>
      )}

      {/* ── Delivery honesty ── */}
      <section className="rounded-2xl bg-gray-50 p-5 text-sm">
        <h3 className="font-semibold text-gray-900">Did they actually arrive?</h3>
        {data?.deliveryWebhook && s?.deliveryKnown ? (
          <p className="mt-1 text-gray-500">
            Delivered to the handset: <strong>{s.delivered}</strong> · opened:{" "}
            <strong>{s.read}</strong> · bounced after sending:{" "}
            <strong className={s.bounced ? "text-red-600" : ""}>{s.bounced}</strong>
          </p>
        ) : (
          <p className="mt-1 text-gray-500">
            We only know Meta <em>accepted</em> these — not that they landed on
            anyone&rsquo;s phone. Real delivery receipts need Meta&rsquo;s status
            webhook switching on (one setting in the WhatsApp configuration
            screen, pointed at <code className="text-xs">/api/webhooks/whatsapp</code>).
            Until then, treat &ldquo;sent&rdquo; as &ldquo;handed over&rdquo;.
          </p>
        )}
      </section>

      {/* ── Day by day ── */}
      {s && s.byDay.length > 0 && (
        <section>
          <h3 className="text-lg font-semibold">Day by day</h3>
          <div className="mt-3 overflow-x-auto rounded-2xl border border-gray-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                <tr>
                  <th className="px-5 py-3 font-medium">Day</th>
                  <th className="px-5 py-3 font-medium">Sent</th>
                  <th className="px-5 py-3 font-medium">Failed</th>
                  <th className="px-5 py-3 font-medium">Typical wait</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {s.byDay.map((d) => (
                  <tr key={d.day}>
                    <td className="px-5 py-3 text-gray-700">
                      {new Date(d.day).toLocaleDateString("en-GB", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      })}
                    </td>
                    <td className="px-5 py-3 text-gray-700">{d.sent}</td>
                    <td
                      className={`px-5 py-3 ${d.failed ? "font-medium text-red-600" : "text-gray-400"}`}
                    >
                      {d.failed}
                    </td>
                    <td className="px-5 py-3 text-gray-700">
                      {duration(d.medianLatencyMs)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Every message ── */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">
            Recent alerts{" "}
            <span className="text-sm font-normal text-gray-400">{rows.length}</span>
          </h3>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={onlyProblems}
              onChange={(e) => setOnlyProblems(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            Only show problems
          </label>
        </div>

        <div className="mt-3 overflow-x-auto rounded-2xl border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
              <tr>
                <th className="px-5 py-3 font-medium">Sent</th>
                <th className="px-5 py-3 font-medium">Agent</th>
                <th className="px-5 py-3 font-medium">Lead</th>
                <th className="px-5 py-3 font-medium">Wait</th>
                <th className="px-5 py-3 font-medium">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((e) => {
                const late = (e.latencyMs ?? 0) > SLOW_MS;
                return (
                  <tr key={e.id} className={e.ok ? "" : "bg-red-50/40"}>
                    <td className="whitespace-nowrap px-5 py-3 text-gray-500">
                      {new Date(e.sentAt).toLocaleString("en-GB", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-5 py-3">
                      <p className="font-medium text-gray-800">
                        {e.agentName || "—"}
                      </p>
                      <p className="text-xs text-gray-400">
                        {[
                          e.brandId ? (brandById(e.brandId)?.shortName ?? e.brandId) : null,
                          e.toMasked || null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </td>
                    <td className="px-5 py-3 text-gray-700">
                      {e.leadName || "—"}
                      {e.kind !== "new_lead" && (
                        <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-500">
                          {e.kind === "nudge"
                            ? "nudge"
                            : e.kind === "test"
                              ? "test"
                              : "back on"}
                        </span>
                      )}
                    </td>
                    <td
                      className={`whitespace-nowrap px-5 py-3 ${late ? "font-medium text-amber-600" : "text-gray-500"}`}
                    >
                      {duration(e.latencyMs)}
                    </td>
                    <td className="px-5 py-3">
                      {!e.ok ? (
                        <span className="text-red-600">
                          Failed — {explain(e.reason ?? "") ?? e.reason}
                        </span>
                      ) : e.failedAt ? (
                        <span className="text-red-600">
                          Bounced{e.failDetail ? ` — ${e.failDetail}` : ""}
                        </span>
                      ) : e.readAt ? (
                        <span className="text-emerald-600">Opened</span>
                      ) : e.deliveredAt ? (
                        <span className="text-emerald-600">Delivered</span>
                      ) : e.fellBack ? (
                        <span className="text-amber-600">Sent without the button</span>
                      ) : (
                        <span className="text-gray-500">Sent</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-sm text-gray-400">
                    {loading
                      ? "Loading…"
                      : onlyProblems
                        ? "No problems in the log — every alert went out cleanly."
                        : "No alerts logged yet. They'll appear here as leads come in."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
