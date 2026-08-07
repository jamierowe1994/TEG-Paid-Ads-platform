"use client";

// The TLE V1 launch tab: the Pro-licence partners, their existing Meta ads, and
// one button that invites them all.
//
// TEMPORARY. This exists for the V1 launch to The Lettings Experts and should
// come out once everyone's on. It is deliberately a separate component rather
// than more lines in app/admin/page.tsx, so removing it later is a delete.
//
// The flow: the roster comes from Team Hub (Pro licence only), an email is
// filled in if the Hub has one, a Meta reference is pasted, Connect verifies it
// against Meta and provisions a dormant account. Nothing is sent until Send All.
//
// WHY CONNECT SHOWS CAMPAIGN NAMES: a wrong Meta id doesn't fail — it silently
// attaches one partner to another partner's spend and leads. Seeing the
// campaign name next to the person's name is what catches that, so the names
// are shown prominently rather than tucked away.

import { useCallback, useEffect, useState } from "react";

interface ProRow {
  userId: string | null;
  name: string;
  email: string;
  partnerPackage: string | null;
  hasAccount: boolean;
  connected: boolean;
  campaignIds: string[];
  awaitingFirstSignIn: boolean;
  exceptionReason?: string | null;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
}

interface RowState {
  email: string;
  metaRef: string;
  busy: boolean;
  error: string | null;
  campaigns: Campaign[];
  accountId: string | null;
  justConnected: boolean;
  /** Lead-flow check: null = not run, "…" = running, else the verdict. */
  flow: string | null;
  /** Per-row invite send: null = not sent, "…" = sending, else the outcome. */
  invite: string | null;
  /** Disconnect: "confirm" = first tap, "…" = working. */
  disc: null | "confirm" | "…";
}

export default function TleProInvite({ pass }: { pass: string }) {
  const [rows, setRows] = useState<ProRow[]>([]);
  const [state, setState] = useState<Record<string, RowState>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [metaConnected, setMetaConnected] = useState(true);
  const [sendingAll, setSendingAll] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [sendResult, setSendResult] = useState<{ ok: boolean; text: string } | null>(null);

  const key = (r: ProRow) => r.email || r.name;

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/tle-pro", {
        headers: { Authorization: `Bearer ${pass}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) {
        setLoadError(data?.error ?? "Couldn't load the roster.");
        setRows([]);
        return;
      }
      setRows(data.rows ?? []);
      setMetaConnected(data.metaConnected !== false);
      setState((prev) => {
        const next: Record<string, RowState> = {};
        for (const r of data.rows ?? []) {
          const k = r.email || r.name;
          next[k] = prev[k] ?? {
            email: r.email,
            metaRef: "",
            busy: false,
            error: null,
            campaigns: [],
            accountId: null,
            justConnected: false,
            flow: null,
            invite: null,
            disc: null,
          };
        }
        return next;
      });
    } catch {
      setLoadError("Couldn't reach the server.");
    } finally {
      setLoading(false);
    }
  }, [pass]);

  useEffect(() => {
    load();
  }, [load]);

  const patch = (k: string, p: Partial<RowState>) =>
    setState((s) => ({ ...s, [k]: { ...s[k], ...p } }));

  async function connect(row: ProRow) {
    const k = key(row);
    const s = state[k];
    if (!s || s.busy) return;
    patch(k, { busy: true, error: null, justConnected: false });
    try {
      const res = await fetch("/api/admin/tle-pro", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${pass}`,
        },
        body: JSON.stringify({
          email: s.email.trim(),
          name: row.name,
          metaRef: s.metaRef.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        patch(k, {
          busy: false,
          error: data?.error ?? "Couldn't connect.",
          campaigns: data?.connection?.campaigns ?? [],
        });
        return;
      }
      patch(k, {
        busy: false,
        error: null,
        campaigns: data.connection?.campaigns ?? [],
        accountId: data.connection?.accountId ?? null,
        justConnected: true,
      });
      // Refresh the roster so hasAccount/connected reflect reality rather than
      // just what this tab believes.
      load();
    } catch {
      patch(k, { busy: false, error: "Couldn't reach the server." });
    }
  }

  /* Who Send All would actually email: on the list, connected to their ads,
     has an account, and hasn't signed in yet. Sending to someone already set
     up would hand them a fresh invite link for an account they're using. */
  const sendable = rows.filter(
    (r) =>
      (r.connected || state[key(r)]?.justConnected) &&
      r.userId &&
      r.awaitingFirstSignIn
  );
  const connectedCount = rows.filter(
    (r) => r.connected || state[key(r)]?.justConnected
  ).length;

  /* Is her number real? Compares Meta's own last-7-days lead count for her
     tagged campaigns against what the portal holds, and flags leads sitting
     on the Page that nobody has tagged. Read-only. */
  async function checkFlow(row: ProRow) {
    const k = key(row);
    const s = state[k];
    if (!s || s.flow === "…") return;
    patch(k, { flow: "…" });
    try {
      const res = await fetch(
        `/api/admin/lead-flow?email=${encodeURIComponent(s.email.trim())}`,
        { headers: { Authorization: `Bearer ${pass}` }, cache: "no-store" }
      );
      const d = await res.json();
      if (!res.ok) {
        patch(k, { flow: d?.error ?? "Check failed." });
        return;
      }
      patch(k, {
        flow:
          (d.verdict ?? d.error ?? "No verdict.") +
          (d.lastSync?.brand?.error
            ? ` Last sync error: ${d.lastSync.brand.error}`
            : ""),
      });
    } catch {
      patch(k, { flow: "Couldn't reach the server." });
    }
  }

  /* Opening in a new tab keeps the admin session in this one, so you can look
     at an agent's account and come straight back to the roster. */
  async function viewAs(userId: string) {
    const res = await fetch("/api/admin/view-as", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${pass}`,
      },
      body: JSON.stringify({ userId }),
    });
    if (res.ok) window.open("/dashboard", "_blank", "noopener");
  }

  /* Invite ONE person. Exists because Send All re-invites EVERYONE still
     pending — and a fresh link kills the one already in their inbox. Adding a
     latecomer after the blast (Stuart, launch morning) must not invalidate
     eleven people's unopened invites. */
  async function sendOne(row: ProRow) {
    const k = key(row);
    if (!row.userId || state[k]?.invite === "…") return;
    patch(k, { invite: "…" });
    try {
      const res = await fetch("/api/admin/send-invites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${pass}`,
        },
        body: JSON.stringify({ userIds: [row.userId] }),
      });
      const d = await res.json();
      if (!res.ok) {
        patch(k, { invite: d.error ?? "Couldn't send." });
        return;
      }
      const r = (d.results ?? [])[0];
      patch(k, {
        invite: r?.sent
          ? `Invite sent to ${r.email} ✓`
          : `Failed: ${r?.detail ?? r?.reason ?? "already signed in, or nothing to send"}`,
      });
      load();
    } catch {
      patch(k, { invite: "Couldn't reach the server." });
    }
  }

  /* Detach the ads. Two taps — wrong-area attachments are exactly why this
     exists, so it shouldn't itself be one accidental click. */
  async function disconnect(row: ProRow) {
    const k = key(row);
    const s = state[k];
    if (!row.userId || s?.disc === "…") return;
    if (s?.disc !== "confirm") {
      patch(k, { disc: "confirm" });
      setTimeout(() => patch(k, { disc: null }), 4000);
      return;
    }
    patch(k, { disc: "…" });
    try {
      const res = await fetch("/api/admin/tle-pro", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${pass}`,
        },
        body: JSON.stringify({ userId: row.userId }),
      });
      const d = await res.json();
      patch(k, {
        disc: null,
        error: res.ok ? null : (d.error ?? "Couldn't disconnect."),
        campaigns: [],
        justConnected: false,
      });
      load();
    } catch {
      patch(k, { disc: null, error: "Couldn't reach the server." });
    }
  }

  async function sendAll() {
    if (!sendable.length || sendingAll) return;
    setSendingAll(true);
    setSendResult(null);
    try {
      const res = await fetch("/api/admin/send-invites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${pass}`,
        },
        // Named explicitly. Without this the route invites everyone pending
        // at the brand, which could reach people who aren't on the list.
        body: JSON.stringify({ userIds: sendable.map((r) => r.userId) }),
      });
      const d = await res.json();
      if (!res.ok) {
        setSendResult({ ok: false, text: d.error ?? "Couldn't send." });
        return;
      }
      const failed = (d.results ?? []).filter(
        (r: { sent: boolean }) => !r.sent
      );
      setSendResult({
        ok: failed.length === 0,
        text:
          failed.length === 0
            ? `Sent ${d.sent} invite${d.sent === 1 ? "" : "s"}. They're on their way.`
            : `Sent ${d.sent}, but ${failed.length} failed: ${failed
                .map(
                  (f: { email: string; reason?: string; detail?: string }) =>
                    `${f.email} (${f.detail ?? f.reason ?? "unknown"})`
                )
                .join(", ")}`,
      });
      setConfirm(false);
      load();
    } catch {
      setSendResult({ ok: false, text: "Couldn't reach the server." });
    } finally {
      setSendingAll(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Lettings Experts — Pro licence launch
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Everyone at TLE on the Pro licence. Their Paid Ads are included,
              so connect the ads they&apos;re already running and their
              dashboard is live the moment they sign in.
            </p>
          </div>
          <button
            onClick={load}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          <span className="text-gray-500">
            <span className="font-semibold text-gray-900">{rows.length}</span> on
            Pro
          </span>
          <span className="text-gray-500">
            <span className="font-semibold text-gray-900">{connectedCount}</span>{" "}
            connected
          </span>
        </div>
        {!metaConnected && (
          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Meta isn&apos;t connected on this server, so campaigns can&apos;t be
            verified. Connect will fail until that&apos;s set up.
          </p>
        )}
      </div>

      {loading && <p className="text-sm text-gray-500">Loading the roster…</p>}
      {loadError && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {loadError}
        </p>
      )}

      <div className="space-y-3">
        {rows.map((row) => {
          const k = key(row);
          const s = state[k];
          if (!s) return null;
          const done = row.connected || s.justConnected;
          return (
            <div
              key={k}
              className={`rounded-2xl border bg-white p-4 ${
                done ? "border-green-300" : "border-gray-200"
              }`}
            >
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-[180px] flex-1">
                  <p className="font-medium text-gray-900">
                    {row.name || "(no name in Team Hub)"}
                  </p>
                  <p className="text-xs text-gray-400">
                    {row.exceptionReason
                      ? "By exception"
                      : `${row.partnerPackage} licence`}
                    {row.hasAccount ? " · account exists" : ""}
                    {row.awaitingFirstSignIn ? " · not signed in yet" : ""}
                  </p>
                  {/* Say WHY someone is on the list without a Pro licence, so
                      it never looks like a mistake to whoever reads it next. */}
                  {row.exceptionReason && (
                    <p className="mt-1 text-xs text-amber-700">
                      {row.exceptionReason}
                    </p>
                  )}
                </div>
                <input
                  value={s.email}
                  onChange={(e) => patch(k, { email: e.target.value })}
                  placeholder="their email"
                  className="min-w-[220px] flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
                <input
                  value={s.metaRef}
                  onChange={(e) => patch(k, { metaRef: e.target.value })}
                  placeholder="Meta ad account or campaign id"
                  className="min-w-[220px] flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
                <button
                  onClick={() => connect(row)}
                  disabled={s.busy || !s.email.trim() || !s.metaRef.trim()}
                  className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                >
                  {s.busy ? "Checking…" : done ? "Reconnect" : "Connect"}
                </button>
                {row.userId && (
                  <button
                    onClick={() => viewAs(row.userId!)}
                    title="Open their dashboard as they'll see it"
                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                  >
                    View as
                  </button>
                )}
                {done && row.userId && row.awaitingFirstSignIn && (
                  <button
                    onClick={() => sendOne(row)}
                    title="Email this person their invite — nobody else's pending link is touched"
                    className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
                    style={{ backgroundColor: "#111827" }}
                  >
                    {s.invite === "…" ? "Sending…" : "Send invite"}
                  </button>
                )}
                {done && (
                  <button
                    onClick={() => checkFlow(row)}
                    title="Compare Meta's lead count for her campaigns against the portal's"
                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                  >
                    {s.flow === "…" ? "Checking…" : "Check leads"}
                  </button>
                )}
              </div>

              {s.error && (
                <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  {s.error}
                </p>
              )}

              {s.invite && s.invite !== "…" && (
                <p
                  className={`mt-3 rounded-lg px-3 py-2 text-sm ${
                    /✓/.test(s.invite)
                      ? "bg-green-50 text-green-800"
                      : "bg-red-50 text-red-700"
                  }`}
                >
                  {s.invite}
                </p>
              )}

              {s.flow && s.flow !== "…" && (
                <p
                  className={`mt-3 rounded-lg px-3 py-2 text-sm ${
                    /^Healthy/.test(s.flow)
                      ? "bg-green-50 text-green-800"
                      : /^GAP/.test(s.flow)
                        ? "bg-red-50 text-red-700"
                        : "bg-amber-50 text-amber-900"
                  }`}
                >
                  {s.flow}
                </p>
              )}

              {/* The verification step: these names are how you tell you've
                  attached the right person to the right ads. */}
              {s.campaigns.length > 0 && (
                <div className="mt-3 rounded-lg bg-gray-50 px-3 py-2">
                  <p className="text-xs font-medium text-gray-500">
                    {s.justConnected ? "Connected to" : "Found"}{" "}
                    {s.campaigns.length} campaign
                    {s.campaigns.length === 1 ? "" : "s"}
                    {s.accountId ? ` in ${s.accountId}` : ""} — check these are
                    theirs:
                  </p>
                  <ul className="mt-1.5 space-y-1">
                    {s.campaigns.map((c) => (
                      <li key={c.id} className="text-sm text-gray-700">
                        {c.name}{" "}
                        <span className="text-xs text-gray-400">
                          ({c.status})
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {done && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <p className="text-sm text-green-700">
                    Connected — {row.campaignIds.length} campaign
                    {row.campaignIds.length === 1 ? "" : "s"}:
                  </p>
                  {/* The ids themselves — no more guessing which ads this
                      row actually owns. */}
                  {row.campaignIds.map((cid) => (
                    <code
                      key={cid}
                      className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-700"
                    >
                      {cid}
                    </code>
                  ))}
                  <button
                    onClick={() => disconnect(row)}
                    disabled={s.disc === "…"}
                    className={`ml-auto rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                      s.disc === "confirm"
                        ? "border-red-300 bg-red-50 text-red-700"
                        : "border-gray-200 text-gray-500 hover:border-red-300 hover:text-red-600"
                    }`}
                  >
                    {s.disc === "…"
                      ? "Disconnecting…"
                      : s.disc === "confirm"
                        ? "Tap again to disconnect"
                        : "Disconnect ads"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Send All. Two steps on purpose: it emails real people and there is
          no recall. The confirm names exactly who gets one. */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium text-gray-900">
              Send {sendable.length} invite{sendable.length === 1 ? "" : "s"}
            </p>
            <p className="mt-1 text-sm text-gray-500">
              Emails everyone who&apos;s connected and hasn&apos;t signed in
              yet. Each gets their own link — no shared password.
            </p>
          </div>
          {!confirm && (
            <button
              onClick={() => setConfirm(true)}
              disabled={sendable.length === 0 || sendingAll}
              className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              Send All
            </button>
          )}
        </div>

        {sendable.length === 0 && !sendResult && (
          <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-500">
            Nobody to invite yet — connect someone&apos;s ads first. Anyone
            who&apos;s already signed in won&apos;t be sent another.
          </p>
        )}

        {confirm && (
          <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
            <p className="text-sm text-gray-700">
              This emails {sendable.length}{" "}
              {sendable.length === 1 ? "person" : "people"} now. It can&apos;t
              be taken back.
            </p>
            <ul className="mt-2 space-y-0.5 text-sm text-gray-600">
              {sendable.map((r) => (
                <li key={r.userId}>· {r.name} — {r.email}</li>
              ))}
            </ul>
            <div className="mt-3 flex gap-2">
              <button
                onClick={sendAll}
                disabled={sendingAll}
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {sendingAll ? "Sending…" : `Yes, send ${sendable.length}`}
              </button>
              <button
                onClick={() => setConfirm(false)}
                disabled={sendingAll}
                className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {sendResult && (
          <p
            className={`mt-3 rounded-lg px-3 py-2 text-sm ${
              sendResult.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"
            }`}
          >
            {sendResult.text}
          </p>
        )}
      </div>
    </div>
  );
}
