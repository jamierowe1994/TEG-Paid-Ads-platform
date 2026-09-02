"use client";

/* Sign-ups, on one screen, with the funnel in the right order.
 *
 * The point of this tab is that "signed up" now means one thing: they paid
 * and an account exists. Everything short of that is a stage of the funnel,
 * not a customer, and each stage is listed separately so nobody has to
 * reconcile two numbers that were never counting the same people.
 *
 *   Joined            → paid (or licensed), account live. The number to trust.
 *   Abandoned payment → details parked, no payment yet, no account.
 *   Left earlier      → started the wizard, never reached payment.
 *   Old unpaid        → accounts made before payment came first. Should only
 *                       ever shrink; if it grows, something is wrong.
 *
 * This tab is for the NEW. Once someone has paid and their ads are connected
 * they've finished arriving — they drop off here and live in People. Otherwise
 * this list would be every customer ever, which is what People is for.
 */

import { useEffect, useMemo, useState } from "react";
import { BRANDS, brandById } from "@/lib/brands";
import { packageById } from "@/lib/packages";
import type { UserProfile } from "@/lib/types";

interface Pending {
  id: string;
  name: string;
  email: string;
  brandId: string;
  packageId: string;
  createdAt: string;
  reachedStripe: boolean;
}

interface DropOff {
  email: string;
  name: string;
  brandId: string | null;
  startedAt: string;
}

const RANGES = [
  { days: 7, label: "Last 7 days" },
  { days: 30, label: "Last 30 days" },
  { days: 0, label: "All time" },
];

function since(days: number): number {
  return days ? Date.now() - days * 24 * 60 * 60 * 1000 : 0;
}

function when(iso: string): string {
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 60) return `${Math.max(1, mins)} min ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
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
  tone?: "plain" | "good" | "warn" | "bad";
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

export default function SignupsBoard({
  pass,
  users,
  dropOffs,
  onOpenAgent,
}: {
  pass: string;
  users: UserProfile[];
  dropOffs: DropOff[];
  onOpenAgent: (u: UserProfile) => void;
}) {
  const [days, setDays] = useState(7);
  const [brand, setBrand] = useState("all");
  const [pending, setPending] = useState<Pending[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/signups", { headers: { Authorization: `Bearer ${pass}` } })
      .then((r) => (r.ok ? r.json() : { pending: [] }))
      .then((d) => {
        if (!cancelled) setPending(d.pending ?? []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pass]);

  const cutoff = since(days);
  const inBrand = (id: string | null) => brand === "all" || id === brand;

  const joined = useMemo(
    () =>
      users
        .filter(
          (u) =>
            new Date(u.createdAt).getTime() >= cutoff &&
            inBrand(u.brandId) &&
            u.paymentState !== "unpaid" &&
            // Paid AND ads connected = settled in. They're in People now.
            !(u.paymentState === "paid" && u.metaCampaignId)
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [users, cutoff, brand]
  );

  const atCardPage = useMemo(
    () =>
      pending.filter(
        (p) => new Date(p.createdAt).getTime() >= cutoff && inBrand(p.brandId)
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pending, cutoff, brand]
  );

  const leftEarlier = useMemo(() => {
    // Someone parked at the card page already appears above — they didn't
    // leave earlier, they left later. Don't count them twice.
    const parked = new Set(pending.map((p) => p.email));
    return dropOffs.filter(
      (d) =>
        new Date(d.startedAt).getTime() >= cutoff &&
        inBrand(d.brandId) &&
        !parked.has(d.email)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dropOffs, pending, cutoff, brand]);

  const legacyUnpaid = useMemo(
    () =>
      users
        .filter((u) => u.paymentState === "unpaid" && inBrand(u.brandId))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [users, brand]
  );

  const paying = joined.filter((u) => u.paymentState === "paid").length;

  return (
    <div className="space-y-8">
      {/* ── Filters ── */}
      <div className="flex flex-wrap items-center gap-2">
        {RANGES.map((r) => (
          <button
            key={r.days}
            onClick={() => setDays(r.days)}
            className={`rounded-lg border px-3.5 py-1.5 text-sm font-medium transition ${
              days === r.days
                ? "border-gray-900 bg-gray-900 text-white"
                : "border-gray-200 bg-white text-gray-600 hover:text-gray-900"
            }`}
          >
            {r.label}
          </button>
        ))}
        <select
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 outline-none focus:border-gray-900"
        >
          <option value="all">All businesses</option>
          {BRANDS.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Joined"
          value={String(joined.length)}
          tone="good"
          note={`${paying} paying, ${joined.length - paying} on a licence · still settling in`}
        />
        <Stat
          label="Abandoned payment"
          value={String(atCardPage.length)}
          tone={atCardPage.length ? "warn" : "plain"}
          note="Details in, payment not made"
        />
        <Stat
          label="Left earlier"
          value={String(leftEarlier.length)}
          note="Started, never reached payment"
        />
        <Stat
          label="Old unpaid accounts"
          value={String(legacyUnpaid.length)}
          tone={legacyUnpaid.length ? "bad" : "good"}
          note="From before payment came first"
        />
      </div>

      {/* ── Joined ─────────────────────────────────────────────────────────
          The list Hayley is actually asking about: real, paid-for accounts,
          newest first. Everything here has money behind it. */}
      <section>
        <h2 className="text-lg font-semibold">
          New sign-ups{" "}
          <span className="text-sm font-normal text-gray-400">
            {joined.length}
          </span>
        </h2>
        <p className="mt-0.5 text-sm text-gray-500">
          Accounts that exist and are still settling in. Nobody reaches this
          list without paying or a licence — and once their ads are connected
          they move on to People.
        </p>
        <div className="mt-3 overflow-x-auto rounded-2xl border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
              <tr>
                <th className="px-5 py-3 font-medium">Agent</th>
                <th className="px-5 py-3 font-medium">Business</th>
                <th className="px-5 py-3 font-medium">Package</th>
                <th className="px-5 py-3 font-medium">Paying</th>
                <th className="px-5 py-3 font-medium">Signed up</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {joined.map((u) => {
                const b = brandById(u.brandId);
                return (
                  <tr
                    key={u.id}
                    onClick={() => onOpenAgent(u)}
                    className="cursor-pointer transition hover:bg-gray-50"
                  >
                    <td className="px-5 py-3">
                      <p className="font-medium text-gray-800">{u.name}</p>
                      <p className="text-xs text-gray-400">{u.email}</p>
                    </td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-2 text-gray-700">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: b?.accent }}
                        />
                        {b?.shortName ?? u.brandId}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-700">
                      {u.accountType === "referral"
                        ? "Referrals only"
                        : (packageById(u.packageId)?.name ?? "—")}
                    </td>
                    <td className="px-5 py-3">
                      {u.paymentState === "paid" ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                          Paid
                        </span>
                      ) : u.paymentState === "licence" ? (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                          Licence
                        </span>
                      ) : (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                          Free
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-gray-500">
                      {when(u.createdAt)}
                    </td>
                  </tr>
                );
              })}
              {joined.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-sm text-gray-400">
                    No new sign-ups in this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Stuck at payment ── */}
      <section>
        <h2 className="text-lg font-semibold">
          Abandoned payment{" "}
          <span className="text-sm font-normal text-gray-400">
            {atCardPage.length}
          </span>
        </h2>
        <p className="mt-0.5 text-sm text-gray-500">
          They filled everything in and didn&rsquo;t pay, so no account was
          created and nothing was sent to anyone. Worth a call — they wanted it
          enough to get this far. If they come back and pay, the account
          appears on its own.
        </p>
        <div className="mt-3 overflow-x-auto rounded-2xl border border-amber-200 bg-amber-50/50">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-amber-100 text-xs uppercase tracking-wide text-amber-700/70">
              <tr>
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Business</th>
                <th className="px-5 py-3 font-medium">Package</th>
                <th className="px-5 py-3 font-medium">Got to Stripe</th>
                <th className="px-5 py-3 font-medium">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-amber-100/60">
              {atCardPage.map((p) => (
                <tr key={p.id}>
                  <td className="px-5 py-3">
                    <p className="font-medium text-gray-800">{p.name}</p>
                    <p className="text-xs text-gray-500">{p.email}</p>
                  </td>
                  <td className="px-5 py-3 text-gray-700">
                    {brandById(p.brandId)?.shortName ?? p.brandId}
                  </td>
                  <td className="px-5 py-3 text-gray-700">
                    {packageById(p.packageId)?.name ?? p.packageId}
                  </td>
                  <td className="px-5 py-3 text-gray-600">
                    {p.reachedStripe ? "Yes" : "No"}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-gray-500">
                    {when(p.createdAt)}
                  </td>
                </tr>
              ))}
              {atCardPage.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-sm text-amber-800/60">
                    {loading ? "Loading…" : "Nobody is stuck at payment."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Left before payment ── */}
      <section>
        <h2 className="text-lg font-semibold">
          Left before the payment page{" "}
          <span className="text-sm font-normal text-gray-400">
            {leftEarlier.length}
          </span>
        </h2>
        <p className="mt-0.5 text-sm text-gray-500">
          Typed an email into the wizard and went no further. We hold nothing
          but the email and when they started.
        </p>
        <div className="mt-3 overflow-x-auto rounded-2xl border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <tbody className="divide-y divide-gray-50">
              {leftEarlier.slice(0, 50).map((d) => (
                <tr key={d.email}>
                  <td className="px-5 py-3">
                    <p className="font-medium text-gray-800">
                      {d.name || d.email}
                    </p>
                    {d.name && <p className="text-xs text-gray-400">{d.email}</p>}
                  </td>
                  <td className="px-5 py-3 text-gray-600">
                    {d.brandId
                      ? (brandById(d.brandId)?.shortName ?? d.brandId)
                      : "Unknown"}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-right text-gray-500">
                    {when(d.startedAt)}
                  </td>
                </tr>
              ))}
              {leftEarlier.length === 0 && (
                <tr>
                  <td className="px-5 py-10 text-center text-sm text-gray-400">
                    Nobody abandoned the wizard in this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── The historic mess, called what it is ── */}
      {legacyUnpaid.length > 0 && (
        <section className="rounded-2xl border border-red-200 bg-red-50 p-5">
          <h2 className="text-sm font-semibold text-red-900">
            Abandoned payment — older accounts{" "}
            <span className="font-normal text-red-700/70">
              {legacyUnpaid.length}
            </span>
          </h2>
          <p className="mt-0.5 text-xs text-red-800/70">
            From before payment came first: they got an account without ever
            paying, and it&rsquo;s locked behind a finish-payment screen. This
            list can only shrink — a new name here means something is wrong.
          </p>
          <ul className="mt-3 space-y-2">
            {legacyUnpaid.map((u) => (
              <li key={u.id}>
                <button
                  onClick={() => onOpenAgent(u)}
                  className="flex w-full flex-wrap items-center gap-3 rounded-lg bg-white/70 px-3 py-2 text-left text-sm hover:bg-white"
                >
                  <span className="font-medium text-gray-800">{u.name}</span>
                  <span className="text-xs text-gray-500">{u.email}</span>
                  <span className="ml-auto text-xs text-gray-400">
                    {brandById(u.brandId)?.shortName ?? u.brandId} ·{" "}
                    {new Date(u.createdAt).toLocaleDateString("en-GB")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
