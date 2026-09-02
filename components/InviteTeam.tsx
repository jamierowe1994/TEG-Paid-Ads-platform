"use client";

/* Invite — one screen, two kinds of people.
 *
 *   An agent: someone who'll run ads and work leads. An account is made for
 *   them and they get a magic link to choose a password. If a licence covers
 *   their ads (TLE Pro) they walk straight in; otherwise they'll be asked to
 *   pay the first time they sign in — same rule as self-serve signup, no
 *   back door.
 *
 *   Admin access: a marketing person or an MD who needs the admin centre for
 *   their business. Their own password, by magic link. Never super.
 *
 * Replaces the launch-week TLE tab, which did the agent half for one brand
 * only and read like the spreadsheet it came from.
 */

import { useCallback, useEffect, useState } from "react";
import { BRANDS, brandById, brandForEmail } from "@/lib/brands";

interface TeamMember {
  id: string;
  email: string;
  name: string;
  role: "md" | "marketing";
  brandId: string;
  createdAt: string;
  active: boolean;
  lastLoginAt: string | null;
}

const field =
  "w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-gray-900";

export default function InviteTeam({
  token,
  role,
  brandId,
  onAgentInvited,
}: {
  token: string;
  role: "super" | "md";
  /** Fixed for an MD; a picker for super. */
  brandId?: string | null;
  onAgentInvited?: () => void;
}) {
  const [kind, setKind] = useState<"agent" | "admin">("agent");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [brand, setBrand] = useState(brandId ?? "");
  const [adminRole, setAdminRole] = useState<"marketing" | "md">("marketing");
  const [licence, setLicence] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");
  const [error, setError] = useState("");

  const [team, setTeam] = useState<TeamMember[]>([]);

  const loadTeam = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/team", { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) setTeam(((await r.json()).team ?? []) as TeamMember[]);
    } catch {
      /* the form still works without the list */
    }
  }, [token]);

  useEffect(() => {
    void loadTeam();
  }, [loadTeam]);

  // Work the business out from the email where we can, so most invites are
  // name + email and nothing else.
  useEffect(() => {
    if (brandId) return;
    const b = brandForEmail(email.trim().toLowerCase());
    if (b) setBrand(b.id);
  }, [email, brandId]);

  const ready = name.trim() && /^\S+@\S+\.\S+$/.test(email.trim()) && brand;

  async function submit() {
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    setDone("");
    try {
      const res = await fetch(kind === "agent" ? "/api/admin/invite-agent" : "/api/admin/team", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(
          kind === "agent"
            ? { name: name.trim(), email: email.trim(), brandId: brand, licence }
            : { name: name.trim(), email: email.trim(), brandId: brand, role: adminRole }
        ),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error ?? "Couldn't send the invite.");
        setBusy(false);
        return;
      }
      setDone(
        kind === "agent"
          ? `Invite sent to ${email.trim()}. They choose a password from the link and they're in.`
          : `${d.resent ? "Link re-sent to" : "Admin invite sent to"} ${email.trim()}.`
      );
      setName("");
      setEmail("");
      setLicence(false);
      if (!brandId) setBrand("");
      if (kind === "agent") onAgentInvited?.();
      else void loadTeam();
    } catch {
      setError("Couldn't reach the server.");
    }
    setBusy(false);
  }

  async function remove(m: TeamMember) {
    if (!window.confirm(`Remove ${m.name}'s admin access?`)) return;
    await fetch("/api/admin/team", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id: m.id }),
    });
    void loadTeam();
  }

  async function resend(m: TeamMember) {
    await fetch("/api/admin/team", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: m.name, email: m.email, brandId: m.brandId, role: m.role }),
    });
    setDone(`Link re-sent to ${m.email}.`);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
      {/* ── The form ── */}
      <section className="rounded-2xl bg-gray-50 p-6">
        <div className="flex gap-1 rounded-xl bg-white p-1">
          {(
            [
              ["agent", "An agent"],
              ["admin", "Admin access"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => {
                setKind(k);
                setError("");
                setDone("");
              }}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
                kind === k ? "bg-gray-900 text-white" : "text-gray-500 hover:text-gray-900"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <p className="mt-4 text-sm text-gray-500">
          {kind === "agent"
            ? "Sets up their account and emails a link to choose a password. Their ads can be connected from their profile once they're in."
            : "Gives someone the admin centre for their business — every agent's ads, spend, leads and conversions. They choose their own password from the link."}
        </p>

        <div className="mt-5 space-y-3">
          <input className={field} placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
          <input
            className={field}
            placeholder="Work email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {!brandId && (
            <select value={brand} onChange={(e) => setBrand(e.target.value)} className={`${field} bg-white`}>
              <option value="">Which business?</option>
              {BRANDS.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}

          {kind === "admin" && role === "super" && (
            <div className="flex gap-2">
              {(
                [
                  ["marketing", "Marketing"],
                  ["md", "Managing Director"],
                ] as const
              ).map(([r, label]) => (
                <button
                  key={r}
                  onClick={() => setAdminRole(r)}
                  className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition ${
                    adminRole === r
                      ? "border-gray-900 bg-gray-900 text-white"
                      : "border-gray-200 bg-white text-gray-600"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {kind === "agent" && brand === "lettings" && (
            <label className="flex items-start gap-2.5 rounded-xl bg-white px-3.5 py-3 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={licence}
                onChange={(e) => setLicence(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300"
              />
              <span>
                <span className="font-medium text-gray-800">Covered by the TLE Pro licence</span>
                <br />
                Their Paid Ads are included, so they won&rsquo;t be asked to pay.
                Only tick this if you know they&rsquo;re on Pro.
              </span>
            </label>
          )}
        </div>

        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {done && <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{done}</p>}

        <button
          onClick={submit}
          disabled={!ready || busy}
          className="mt-4 w-full rounded-xl bg-gray-900 py-3 text-sm font-medium text-white transition hover:bg-gray-700 disabled:opacity-40"
        >
          {busy ? "Sending…" : "Send invite"}
        </button>
      </section>

      {/* ── Who has admin access ── */}
      <section>
        <h2 className="text-lg font-semibold">
          Admin access{" "}
          <span className="text-sm font-normal text-gray-400">{team.length}</span>
        </h2>
        <p className="mt-0.5 text-sm text-gray-500">
          People invited into the admin centre. The group&rsquo;s own admins and the
          MDs set up at launch aren&rsquo;t listed — they sign in as before.
        </p>
        <div className="mt-3 overflow-x-auto rounded-2xl border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
              <tr>
                <th className="px-5 py-3 font-medium">Person</th>
                <th className="px-5 py-3 font-medium">Access</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {team.map((m) => (
                <tr key={m.id}>
                  <td className="px-5 py-3">
                    <p className="font-medium text-gray-800">{m.name}</p>
                    <p className="text-xs text-gray-400">{m.email}</p>
                  </td>
                  <td className="px-5 py-3 text-gray-700">
                    {m.role === "md" ? "Managing Director" : "Marketing"} ·{" "}
                    {brandById(m.brandId)?.shortName ?? m.brandId}
                  </td>
                  <td className="px-5 py-3">
                    {m.active ? (
                      <span className="text-emerald-600">
                        Active
                        {m.lastLoginAt && (
                          <span className="text-gray-400">
                            {" "}
                            · last in {new Date(m.lastLoginAt).toLocaleDateString("en-GB")}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-amber-600">Invited, not set up yet</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-right text-xs">
                    {!m.active && (
                      <button onClick={() => resend(m)} className="mr-3 font-medium text-gray-500 hover:text-gray-900">
                        Resend
                      </button>
                    )}
                    <button onClick={() => remove(m)} className="font-medium text-red-500 hover:text-red-700">
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {team.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-10 text-center text-sm text-gray-400">
                    Nobody invited yet.
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
