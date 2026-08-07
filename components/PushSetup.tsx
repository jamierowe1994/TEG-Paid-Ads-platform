"use client";

// Lead alerts on the phone — the piece that makes the installed PWA open on
// the exact lead.
//
// WHY: iOS never lets a tapped LINK open a home-screen web app — WhatsApp and
// email links will always open Safari. The one mechanism Apple allows (iOS
// 16.4+) is a push notification sent by the installed app: tapping it opens
// the PWA at the URL we choose. So this component registers the service
// worker, and — only inside the INSTALLED app, where the permission can
// actually be granted — offers a one-tap "turn on alerts".
//
// Quietly does nothing in a plain browser tab on iOS (no Notification API
// there), so nobody gets nagged somewhere the feature can't work.

import { useEffect, useState } from "react";

const DISMISSED_KEY = "teg-push-dismissed";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function subscribe(): Promise<boolean> {
  try {
    const reg = await navigator.serviceWorker.ready;
    const keyRes = await fetch("/api/push/key");
    if (!keyRes.ok) return false;
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
    return save.ok;
  } catch {
    return false;
  }
}

export default function PushSetup() {
  // "offer" -> show the banner; "enabled" -> offer a self-test;
  // "reinstall" -> the app is pinned to a retired origin (see below).
  const [phase, setPhase] = useState<
    "hidden" | "offer" | "enabled" | "testing" | "tested" | "reinstall" | "blocked"
  >("hidden");

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // Registering is always safe — the worker caches nothing.
    navigator.serviceWorker.register("/sw.js").catch(() => {});

    const displayStandalone = window.matchMedia(
      "(display-mode: standalone)"
    ).matches;
    const navStandalone =
      (navigator as unknown as { standalone?: boolean }).standalone === true;

    // navigator.standalone true but display-mode NOT standalone = iOS's
    // out-of-scope in-app browser: the home-screen app was installed against
    // an address the site no longer lives on (the pre-launch Railway host),
    // and the canonical redirect walks every page to the branded domain,
    // which iOS treats as leaving the app — so it shows Safari's bars inside
    // it (James's screenshot, 7 Aug). Nothing fixes that but reinstalling:
    // the origin is baked in at install time. Say so, instead of leaving the
    // user staring at browser chrome that "appeared from nowhere".
    if (navStandalone && !displayStandalone) {
      setPhase("reinstall");
      return;
    }

    if (!("Notification" in window) || !("PushManager" in window)) return;

    if (Notification.permission === "granted") {
      // Permission survives, subscriptions sometimes don't (reinstall, new
      // phone) — re-assert quietly on every app open.
      subscribe();
      return;
    }
    // Only offer where granting is possible and sensible: the installed app.
    if (displayStandalone && Notification.permission === "default") {
      if (localStorage.getItem(DISMISSED_KEY)) return;
      setPhase("offer");
    }
  }, []);

  async function enable() {
    // Must be called from the tap itself — iOS refuses permission prompts
    // that aren't user gestures. EVERY outcome must move the UI somewhere:
    // this used to await requestPermission bare, and when iOS rejected the
    // call outright (as it does in the out-of-scope browser view) the
    // function died silently — the banner just sat there, came back on
    // every launch, and looked like the button did nothing (James, 7 Aug).
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setPhase("blocked");
        return;
      }
      const ok = await subscribe();
      setPhase(ok ? "enabled" : "blocked");
    } catch {
      setPhase("blocked");
    }
  }

  async function sendTest() {
    setPhase("testing");
    try {
      await fetch("/api/push/test", { method: "POST" });
    } catch {
      /* the notification itself is the result — nothing useful to show here */
    }
    setPhase("tested");
    setTimeout(() => setPhase("hidden"), 6000);
  }

  if (phase === "hidden") return null;

  if (phase === "reinstall") {
    return (
      <div className="fixed inset-x-4 top-4 z-[70] rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-xl">
        <div className="flex items-start gap-3">
          <span className="text-xl">📲</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-amber-900">
              Launch Pad has moved — reinstall to lose the browser bars
            </p>
            <p className="mt-1 text-xs leading-relaxed text-amber-800">
              This icon points at our old address. Delete it from your home
              screen, open launchpad.theexpertsgroup.co.uk in Safari, then
              Share → Add to Home Screen. Takes about 30 seconds.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-x-4 top-4 z-[70] rounded-2xl border border-gray-200 bg-white p-4 shadow-xl">
      {phase === "offer" ? (
        <div className="flex items-center gap-3">
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900">
            Get lead alerts on this phone
          </p>
          <button
            onClick={enable}
            className="shrink-0 rounded-full bg-[var(--group)] px-5 py-2 text-sm font-semibold text-white active:scale-[0.97]"
          >
            Turn on
          </button>
          <button
            aria-label="Not now"
            onClick={() => {
              localStorage.setItem(DISMISSED_KEY, "1");
              setPhase("hidden");
            }}
            className="shrink-0 p-1 text-gray-400"
          >
            ✕
          </button>
        </div>
      ) : phase === "blocked" ? (
        <div className="flex items-center gap-3">
          <p className="min-w-0 flex-1 text-sm text-gray-700">
            Your phone didn&apos;t allow it. Check Settings → Notifications →
            Launch Pad, or reinstall the app and try again.
          </p>
          <button
            aria-label="Dismiss"
            onClick={() => setPhase("hidden")}
            className="shrink-0 p-1 text-gray-400"
          >
            ✕
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <p className="min-w-0 flex-1 text-sm font-medium text-gray-900">
            {phase === "tested"
              ? "Sent — it should appear in a moment."
              : "Alerts are on ✓"}
          </p>
          {phase === "enabled" && (
            <button
              onClick={sendTest}
              className="shrink-0 rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700"
            >
              Send a test
            </button>
          )}
        </div>
      )}
    </div>
  );
}
