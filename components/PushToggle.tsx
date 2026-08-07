"use client";

// Profile-page control for lead alerts on THIS device: the permanent,
// verifiable answer to "is it actually on?" — the dashboard banner is a
// one-shot offer, this is the state you can come back and check, and the
// switch-off James asked for.
//
// The truth is read from the device itself (Notification.permission plus
// whether a live push subscription exists), never from a stored flag — a
// flag can lie after a reinstall; the subscription can't.

import { useEffect, useState } from "react";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type State =
  | "unsupported" // browser tab on iOS, old browser — can't work here
  | "off"
  | "on"
  | "denied" // blocked at OS level; only Settings can undo that
  | "busy";

export default function PushToggle() {
  const [state, setState] = useState<State>("unsupported");

  useEffect(() => {
    (async () => {
      if (
        !("serviceWorker" in navigator) ||
        !("Notification" in window) ||
        !("PushManager" in window)
      )
        return;
      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        const sub = await reg.pushManager.getSubscription();
        setState(
          sub && Notification.permission === "granted" ? "on" : "off"
        );
      } catch {
        setState("off");
      }
    })();
  }, []);

  async function turnOn() {
    setState("busy");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const keyRes = await fetch("/api/push/key");
      const { key } = await keyRes.json();
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key),
        }));
      const save = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      setState(save.ok ? "on" : "off");
    } catch {
      setState("off");
    }
  }

  async function turnOff() {
    setState("busy");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        // Server first, then the device — the reverse order can leave the
        // server pushing at a subscription the device already dropped.
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {});
        await sub.unsubscribe();
      }
    } catch {
      /* worst case the next send prunes it server-side */
    }
    setState("off");
  }

  // Nothing to control here (e.g. a Safari tab on iOS) — say nothing rather
  // than show a switch that can't work.
  if (state === "unsupported") return null;

  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-gray-200 bg-white p-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-900">
          Lead alerts on this device
        </p>
        <p className="mt-0.5 text-xs text-gray-500">
          {state === "on"
            ? "On — a tapped alert opens the lead in the app."
            : state === "denied"
              ? "Blocked in your phone's Settings → Notifications → Launch Pad."
              : "Off — you'll only hear about new leads on WhatsApp."}
        </p>
      </div>
      {state === "denied" ? null : (
        <button
          onClick={state === "on" ? turnOff : turnOn}
          disabled={state === "busy"}
          className={`shrink-0 rounded-full px-5 py-2 text-sm font-semibold transition active:scale-[0.97] ${
            state === "on"
              ? "border border-gray-200 text-gray-700"
              : "bg-[var(--group)] text-white"
          } disabled:opacity-50`}
        >
          {state === "busy" ? "…" : state === "on" ? "Turn off" : "Turn on"}
        </button>
      )}
    </div>
  );
}
