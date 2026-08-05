"use client";

// What the approved WhatsApp template actually says, read back from Meta.
//
// The template is the one part of the lead alert that can't change without
// re-approval, so the button's URL decides which workaround is possible:
// a STATIC url means we can only change what lives at that address, while a
// DYNAMIC one (…/{{1}}) means each message can already point at a specific
// lead — we'd just be failing to send the parameter.

import { useState } from "react";

interface Button {
  type?: string;
  text?: string;
  url: string | null;
  isDynamic: boolean;
}
interface Tpl {
  name?: string;
  status?: string;
  language?: string;
  body?: string | null;
  buttons: Button[];
}

export default function WhatsAppTemplate({ pass }: { pass: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tpls, setTpls] = useState<Tpl[] | null>(null);
  const [tried, setTried] = useState<string[]>([]);

  async function check() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/whatsapp/template", {
        headers: { Authorization: `Bearer ${pass}` },
        cache: "no-store",
      });
      const d = await res.json();
      setTried(d.tried ?? d.howFound ?? []);
      if (!res.ok || d.error) {
        setError(d.error ?? `Couldn't read the template (${res.status}).`);
        setTpls(null);
        return;
      }
      setTpls(d.templates ?? []);
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-gray-900">Message template</h3>
          <p className="mt-0.5 text-sm text-gray-500">
            What the approved template says, and where its button points.
          </p>
        </div>
        <button
          onClick={check}
          disabled={loading}
          className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
        >
          {loading ? "Checking…" : "Check template"}
        </button>
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {/* When discovery fails, showing what was attempted turns "it didn't
          work" into something actionable. */}
      {error && tried.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-gray-400">
          {tried.map((t, i) => (
            <li key={i}>· {t}</li>
          ))}
        </ul>
      )}

      {tpls?.length === 0 && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Meta returned no template matching the configured name. Check
          WHATSAPP_TEMPLATE.
        </p>
      )}

      {tpls?.map((t) => (
        <div key={t.name} className="mt-4 border-t border-gray-100 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-gray-900">{t.name}</span>
            <span
              className={`rounded px-2 py-0.5 text-xs font-medium ${
                t.status === "APPROVED"
                  ? "bg-green-50 text-green-700"
                  : "bg-amber-50 text-amber-800"
              }`}
            >
              {t.status}
            </span>
            <span className="text-xs text-gray-400">{t.language}</span>
          </div>

          {t.body && (
            <p className="mt-2 whitespace-pre-wrap rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">
              {t.body}
            </p>
          )}

          {t.buttons.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">No buttons.</p>
          ) : (
            t.buttons.map((b, i) => (
              <div key={i} className="mt-2 text-sm">
                <span className="font-medium text-gray-900">
                  {b.text ?? "(button)"}
                </span>{" "}
                <span className="text-gray-400">·</span>{" "}
                <span className="break-all text-gray-600">{b.url ?? b.type}</span>
                <div className="mt-1">
                  {b.isDynamic ? (
                    <span className="rounded bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                      Dynamic — we can deep-link each lead with no re-approval
                    </span>
                  ) : (
                    <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                      Static — the address is fixed; only what lives there can change
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      ))}
    </div>
  );
}
