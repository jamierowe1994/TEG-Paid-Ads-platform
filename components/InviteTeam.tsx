"use client";

/* Invite — and the list of everyone who already has admin access.
 *
 * Two kinds of invite:
 *   An agent: someone who'll run ads and work leads. An account is made and
 *   they get a magic link to choose a password. If a licence covers their
 *   ads (TLE Pro) they walk straight in; otherwise they're asked to pay on
 *   first sign-in — same rule as self-serve signup, no back door.
 *
 *   Admin access: marketing or an MD. Their own password, by magic link.
 *
 * Below the form: every admin, by business — the built-in directory (the
 * group, the launch MDs, Francesca) and everyone invited since, in one list.
 * Open anyone to see when they last signed in, email them a fresh link, or
 * copy one to paste into WhatsApp. Following the link is how a password
 * gets set, so "reset their password" and "send a link" are the same thing.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { BRANDS, brandById, brandForEmail } from "@/lib/brands";

interface TeamRow {
  id: string | null;
  email: string;
  name: string;
  role: "super" | "md" | "marketing";
  brandId: string | null;
  source: "directory" | "invited";
  canSignIn: boolean;
  ownPassword: boolean;
  lastLoginAt: string | null;
  createdAt: string | null;
}

const ROLE_LABEL: Record<TeamRow["role"], string> = {
  super: "Group admin",
  md: "Managing Director",
  marketing: "Marketing",
};

const field =
  "w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-gray-900";

function ago(iso: string | null): string {
  if (!iso) return "Never";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 2) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} day${d === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

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

  const [team, setTeam] = useState<TeamRow[]>([]);
  const [open, setOpen] = useState<TeamRow | null>(null);
  const [filterBrand, setFilterBrand] = useState("all");

  const headers = useMemo(
    () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` }),
    [token]
  );

  const loadTeam = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/team", { headers });
      if (r.ok) setTeam(((await r.json()).team ?? []) as TeamRow[]);
    } catch {
      /* the form still works without the list */
    }
  }, [headers]);

  useEffect(() => {
    void loadTeam();
  }, [loadTeam]);

  useEffect(() => {
    if (brandId) return;
    const b = brandForEmail(email.trim().toLowerCase());
    if (b) setBrand(b.id);
  }, [email, brandId]);

  const knownAdmin = useMemo(
    () => team.find((t) => t.email === email.trim().toLowerCase()) ?? null,
    [team, email]
  );

  const ready =
    /^\S+@\S+\.\S+$/.test(email.trim()) &&
    (knownAdmin && kind === "admin" ? true : name.trim() && brand);

  async function submit() {
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    setDone("");
    try {
      const res = await fetch(kind === "agent" ? "/api/admin/invite-agent" : "/api/admin/team", {
        method: "POST",
        headers,
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
          : d.existing
            ? `${email.trim()} already had access — a fresh sign-in link is on its way to them.`
            : `Admin invite sent to ${email.trim()}.`
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

  const grouped = useMemo(() => {
    const list = team.filter((t) => filterBrand === "all" || (t.brandId ?? "group") === filterBrand);
    const groups = new Map<string, TeamRow[]>();
    for (const t of list) {
      const key = t.brandId ?? "group";
      groups.set(key, [...(groups.get(key) ?? []), t]);
    }
    const order = ["group", ...BRANDS.map((b) => b.id)];
    return order.filter((k) => groups.has(k)).map((k) => ({
      key: k,
      label: k === "group" ? "The Experts Group" : (brandById(k)?.name ?? k),
      accent: k === "group" ? "#111111" : (brandById(k)?.accent ?? "#111"),
      rows: groups.get(k)!.sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name)),
    }));
  }, [team, filterBrand]);

  return (
    <div className="space-y-10">
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
            <input
              className={field}
              placeholder="Work email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {kind === "admin" && knownAdmin ? (
              <p className="rounded-xl bg-white px-3.5 py-3 text-sm text-gray-600">
                <span className="font-medium text-gray-800">{knownAdmin.name}</span> already
                has {ROLE_LABEL[knownAdmin.role]} access
                {knownAdmin.brandId ? ` for ${brandById(knownAdmin.brandId)?.shortName}` : ""}.
                Sending will email them a fresh sign-in link.
              </p>
            ) : (
              <>
                <input className={field} placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
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
              </>
            )}

            {kind === "admin" && role === "super" && !knownAdmin && (
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
            {busy ? "Sending…" : kind === "admin" && knownAdmin ? "Send sign-in link" : "Send invite"}
          </button>
        </section>

        {/* ── Who has admin access ── */}
        <section>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">
              Admins <span className="text-sm font-normal text-gray-400">{team.length}</span>
            </h2>
            {role === "super" && (
              <select
                value={filterBrand}
                onChange={(e) => setFilterBrand(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 outline-none focus:border-gray-900"
              >
                <option value="all">All businesses</option>
                <option value="group">The Experts Group</option>
                {BRANDS.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <p className="mt-0.5 text-sm text-gray-500">
            Everyone who can open the admin centre. Click a person to send or
            copy a sign-in link — that&rsquo;s also how a password gets reset.
          </p>

          <div className="mt-3 space-y-4">
            {grouped.map((g) => (
              <div key={g.key} className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
                <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-2.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: g.accent }} />
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{g.label}</p>
                </div>
                <table className="w-full text-left text-sm">
                  <tbody className="divide-y divide-gray-50">
                    {g.rows.map((m) => (
                      <tr
                        key={m.email}
                        onClick={() => setOpen(m)}
                        className="cursor-pointer transition hover:bg-gray-50"
                      >
                        <td className="px-5 py-3">
                          <p className="font-medium text-gray-800">{m.name}</p>
                          <p className="text-xs text-gray-400">{m.email}</p>
                        </td>
                        <td className="whitespace-nowrap px-5 py-3 text-gray-600">{ROLE_LABEL[m.role]}</td>
                        <td className="whitespace-nowrap px-5 py-3 text-right text-xs">
                          {m.lastLoginAt ? (
                            <span className="text-gray-500">Signed in {ago(m.lastLoginAt)}</span>
                          ) : m.canSignIn ? (
                            // Tracking started 2 Sept 2026 — a blank here
                            // means "not since then", not "never".
                            <span className="text-gray-400">No sign-in recorded yet</span>
                          ) : (
                            <span className="text-amber-600">Invited, not set up</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
            {team.length === 0 && (
              <p className="rounded-2xl border border-gray-200 bg-white px-5 py-10 text-center text-sm text-gray-400">
                Loading…
              </p>
            )}
          </div>
        </section>
      </div>

      {open && (
        <AdminSheet
          row={open}
          headers={headers}
          canRemove={open.source === "invited"}
          onClose={() => setOpen(null)}
          onChanged={() => {
            void loadTeam();
          }}
        />
      )}
    </div>
  );
}

/* One admin: who they are, when they were last in, and the two link actions. */
function AdminSheet({
  row,
  headers,
  canRemove,
  onClose,
  onChanged,
}: {
  row: TeamRow;
  headers: Record<string, string>;
  canRemove: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  async function makeLink() {
    setBusy("link");
    setError("");
    setCopied(false);
    try {
      const r = await fetch("/api/admin/team/link", {
        method: "POST",
        headers,
        body: JSON.stringify({ email: row.email }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setError(d.error ?? "Couldn't make a link.");
      else {
        setLink(d.link);
        setNote(`Lasts ${d.days} days. Any older link for ${row.name.split(" ")[0]} has just stopped working.`);
      }
    } catch {
      setError("Couldn't reach the server.");
    }
    setBusy("");
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      /* the link is on screen to select by hand */
    }
  }

  async function emailLink() {
    setBusy("email");
    setError("");
    try {
      const r = await fetch("/api/admin/team", {
        method: "POST",
        headers,
        body: JSON.stringify({ email: row.email, name: row.name, brandId: row.brandId, role: row.role }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setError(d.error ?? "Couldn't send.");
      else setNote(`Sign-in link emailed to ${row.email}.`);
    } catch {
      setError("Couldn't reach the server.");
    }
    setBusy("");
  }

  async function remove() {
    if (!row.id || !window.confirm(`Remove ${row.name}'s admin access?`)) return;
    await fetch("/api/admin/team", { method: "DELETE", headers, body: JSON.stringify({ id: row.id }) });
    onChanged();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[110] flex items-end justify-center bg-gray-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white px-6 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-7 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
          {ROLE_LABEL[row.role]}
          {row.brandId ? ` · ${brandById(row.brandId)?.name ?? row.brandId}` : " · The Experts Group"}
        </p>
        <h3 className="mt-1 text-xl font-semibold tracking-tight text-gray-900">{row.name}</h3>
        <p className="text-sm text-gray-500">{row.email}</p>

        <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-gray-50 p-3">
            <dt className="text-xs text-gray-400">Last signed in</dt>
            <dd className="mt-0.5 font-medium text-gray-800">
              {row.lastLoginAt ? ago(row.lastLoginAt) : "Not recorded yet"}
            </dd>
          </div>
          <div className="rounded-xl bg-gray-50 p-3">
            <dt className="text-xs text-gray-400">Signs in with</dt>
            <dd className="mt-0.5 font-medium text-gray-800">
              {row.ownPassword
                ? "Their own password"
                : row.source === "directory"
                  ? "The shared team password"
                  : "Nothing yet — link not used"}
            </dd>
          </div>
        </dl>

        <div className="mt-5 space-y-2">
          <button
            onClick={makeLink}
            disabled={!!busy}
            className="w-full rounded-xl bg-gray-900 py-3 text-sm font-medium text-white transition hover:bg-gray-700 disabled:opacity-40"
          >
            {busy === "link" ? "Making a link…" : "Make a sign-in link to copy"}
          </button>
          {link && (
            <div className="rounded-xl bg-gray-50 p-3">
              <p className="break-all font-mono text-[11px] leading-relaxed text-gray-600">{link}</p>
              <button
                onClick={copy}
                className="mt-2 w-full rounded-lg border border-gray-200 bg-white py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
              >
                {copied ? "Copied" : "Copy link"}
              </button>
            </div>
          )}
          <button
            onClick={emailLink}
            disabled={!!busy}
            className="w-full rounded-xl border border-gray-200 bg-white py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-40"
          >
            {busy === "email" ? "Sending…" : "Email them a sign-in link"}
          </button>
          <p className="px-1 text-xs text-gray-400">
            Following the link is how they set (or reset) their password, so
            this is the reset button too.
          </p>
        </div>

        {note && <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{note}</p>}
        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="mt-5 flex items-center justify-between">
          {canRemove ? (
            <button onClick={remove} className="text-sm font-medium text-red-500 hover:text-red-700">
              Remove access
            </button>
          ) : (
            <span className="text-xs text-gray-400">Built-in admin — removing them is a code change.</span>
          )}
          <button onClick={onClose} className="text-sm font-medium text-gray-400 hover:text-gray-900">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
