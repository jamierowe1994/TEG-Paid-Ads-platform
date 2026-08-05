"use client";

// Read and test the platform's emails without emailing a real agent to find
// out how they land.
//
// Preview opens the actual rendered HTML in a new tab — the same markup the
// inbox gets, not a description of it. Send fires one to one address with
// [TEST] on the subject, so it can never be mistaken for the real thing.
//
// Inviting agents for real is somewhere else entirely (the Invite tab), and
// deliberately so: nothing here can reach the agent list.

import { useCallback, useEffect, useState } from "react";

interface Template {
  id: string;
  label: string;
  subject: string;
}

export default function EmailTest({ pass }: { pass: string }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [transport, setTransport] = useState<string>("");
  const [canSend, setCanSend] = useState(true);
  const [chosen, setChosen] = useState("invite");
  const [to, setTo] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/email", {
        headers: { Authorization: `Bearer ${pass}` },
        cache: "no-store",
      });
      if (!res.ok) return;
      const d = await res.json();
      setTemplates(d.templates ?? []);
      setTransport(d.transport ?? "none");
      setCanSend(d.canSend !== false);
    } catch {
      /* the panel just stays empty */
    }
  }, [pass]);

  useEffect(() => {
    load();
  }, [load]);

  /* The preview needs the admin password on the request, so it can't just be
     an <a href>. Fetch it and hand the browser a blob to open instead. */
  async function preview() {
    const res = await fetch(`/api/admin/email?template=${chosen}`, {
      headers: { Authorization: `Bearer ${pass}` },
    });
    const html = await res.text();
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  async function send() {
    const addr = to.trim();
    if (!addr || sending) return;
    setSending(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${pass}`,
        },
        body: JSON.stringify({ template: chosen, to: addr }),
      });
      const d = await res.json();
      setResult(
        res.ok
          ? { ok: true, text: `Sent to ${addr} via ${d.transport} — check your inbox.` }
          : {
              ok: false,
              // Surface the transport's own words: "domain not verified" and
              // "API key is invalid" are both fixable, and both look identical
              // if flattened to "couldn't send".
              text: d.detail ?? d.error ?? d.reason ?? "Couldn't send.",
            }
      );
    } catch {
      setResult({ ok: false, text: "Couldn't reach the server." });
    } finally {
      setSending(false);
    }
  }

  const label = (id: string) =>
    templates.find((t) => t.id === id)?.subject ?? "";

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Emails</h2>
        {transport && (
          <span className="flex items-center gap-1.5 text-xs text-gray-500">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                transport === "resend"
                  ? "bg-green-500"
                  : transport === "microsoft"
                    ? "bg-amber-500"
                    : "bg-gray-300"
              }`}
            />
            {transport === "resend"
              ? "Sending via Resend"
              : transport === "microsoft"
                ? "Sending via the Microsoft mailbox"
                : "No email transport configured"}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-gray-500">
        Read an email exactly as it will arrive, and send yourself a copy before
        anyone else gets one.
      </p>

      <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1 text-sm">
            <span className="text-xs font-medium text-gray-500">Email</span>
            <select
              value={chosen}
              onChange={(e) => {
                setChosen(e.target.value);
                setResult(null);
              }}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={preview}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Preview
          </button>
        </div>

        {label(chosen) && (
          <p className="mt-3 text-xs text-gray-400">
            Subject: <span className="text-gray-600">[TEST] {label(chosen)}</span>
          </p>
        )}

        <div className="mt-4 flex flex-col gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-end">
          <label className="flex-1 text-sm">
            <span className="text-xs font-medium text-gray-500">Send a test to</span>
            <input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="you@theexpertsgroup.co.uk"
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </label>
          <button
            onClick={send}
            disabled={sending || !to.trim() || !canSend}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {sending ? "Sending…" : "Send test"}
          </button>
        </div>

        {!canSend && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Nothing can send yet — add the Resend keys, or connect the Microsoft
            mailbox above.
          </p>
        )}

        {result && (
          <p
            className={`mt-3 rounded-lg px-3 py-2 text-sm ${
              result.ok
                ? "bg-green-50 text-green-800"
                : "bg-red-50 text-red-700"
            }`}
          >
            {result.text}
          </p>
        )}

        <p className="mt-3 text-xs text-gray-400">
          Goes to that one address only, with [TEST] on the subject. Inviting
          agents for real is on the Invite tab.
        </p>
      </div>
    </section>
  );
}
