"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

// InstallGate — funnels mobile-browser visitors into the installed PWA.
//
// It only guards the APP itself (sign-in + the portal), NOT the public
// marketing site. So a phone visitor can freely browse the landing page,
// packages, sign-up — and only when they head to /login (or land anywhere in
// the dashboard/admin in a browser) do we cover the view with a full-screen
// prompt telling them to install LaunchPad and use that instead. It's a SOFT
// lock: there's a "continue in browser" escape hatch so nobody is ever
// hard-trapped (e.g. locked-down devices, or the Microsoft OAuth-in-PWA edge
// case).
//
// Desktop and the already-installed PWA never see this — the component renders
// nothing there.

// The routes that ARE the app (everything else is the public marketing site,
// which stays freely browsable in a phone browser).
function isAppRoute(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/admin")
  );
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const SKIP_KEY = "lp-skip-install"; // sessionStorage: re-nudges on a fresh visit

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari exposes this on navigator when launched from the home screen
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function detectPlatform(): "ios" | "android" | "other-mobile" | "desktop" {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipod/.test(ua)) return "ios";
  // iPadOS 13+ reports as "macintosh"; disambiguate via touch points
  if (/ipad/.test(ua) || (/macintosh/.test(ua) && navigator.maxTouchPoints > 1))
    return "ios";
  if (/android/.test(ua)) return "android";
  if (/mobile|iemobile|blackberry|opera mini/.test(ua)) return "other-mobile";
  return "desktop";
}

export default function InstallGate() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  /* True while the dashboard still owes a setup step (set a password, link an
     email). Pushing someone to install before their account works would mean
     installing an app they can't yet use — and this prompt sits above those
     screens, so it would hide them entirely. */
  const [setupOwed, setSetupOwed] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      setSkipped(sessionStorage.getItem(SKIP_KEY) === "1");
    } catch {
      /* private mode — ignore */
    }
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // The flag is set by the dashboard as it renders, so watch rather than
    // read once — it can flip after this mounts.
    const read = () => setSetupOwed(document.body.dataset.setupGate === "1");
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.body, { attributes: true, attributeFilter: ["data-setup-gate"] });

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      mo.disconnect();
    };
  }, []);

  // Render nothing until mounted (avoids SSR/hydration mismatch). `?install=
  // preview` forces the prompt to show anywhere (for reviewing it on desktop)
  // — it can only reveal the gate, never bypass it.
  const forced =
    mounted && new URLSearchParams(window.location.search).get("install") === "preview";
  // Never on the public marketing site (only sign-in + the portal), the
  // installed app, or after the user opts to continue in-browser.
  if (!mounted) return null;
  if (!forced && (!isAppRoute(pathname) || skipped || isStandalone() || setupOwed))
    return null;
  const platform = detectPlatform() === "desktop" && forced ? "ios" : detectPlatform();
  if (platform === "desktop") return null;

  const dismiss = () => {
    try {
      sessionStorage.setItem(SKIP_KEY, "1");
    } catch {
      /* ignore */
    }
    setSkipped(true);
  };

  const androidInstall = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === "accepted") setDeferred(null);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Install LaunchPad"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483647,
        background: "#ffffff",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "28px 24px calc(28px + env(safe-area-inset-bottom))",
        textAlign: "center",
        overflowY: "auto",
      }}
    >
      {/* App icon */}
      <img
        src="/apple-touch-icon.png"
        alt="LaunchPad"
        width={84}
        height={84}
        style={{
          width: 84,
          height: 84,
          borderRadius: 20,
          boxShadow: "0 8px 24px rgba(17,24,39,0.14)",
        }}
      />

      <h1
        style={{
          margin: "22px 0 8px",
          fontSize: 24,
          fontWeight: 800,
          letterSpacing: "-0.02em",
          color: "#111827",
          lineHeight: 1.15,
        }}
      >
        Add LaunchPad to your&nbsp;home&nbsp;screen
      </h1>
      <p
        style={{
          margin: "0 0 24px",
          fontSize: 15,
          lineHeight: 1.5,
          color: "#6b7280",
          maxWidth: 320,
        }}
      >
        LaunchPad runs as an app. Install it for the proper full-screen
        experience — it takes about five seconds.
      </p>

      {/* Platform-specific instructions */}
      {platform === "android" && deferred ? (
        <button
          onClick={androidInstall}
          style={{
            appearance: "none",
            border: "none",
            background: "#e31f36",
            color: "#fff",
            fontSize: 16,
            fontWeight: 600,
            padding: "14px 28px",
            borderRadius: 9999,
            cursor: "pointer",
          }}
        >
          Install LaunchPad
        </button>
      ) : (
        <ol
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: 14,
            maxWidth: 340,
            width: "100%",
          }}
        >
          <Step n={1}>
            {platform === "ios" ? (
              <>
                Tap the <ShareGlyph /> <strong>Share</strong> button in Safari&apos;s
                toolbar
              </>
            ) : (
              <>
                Open the browser menu <strong>( ⋮ )</strong> at the top right
              </>
            )}
          </Step>
          <Step n={2}>
            {platform === "ios" ? (
              <>
                Scroll down and tap <strong>Add to Home Screen</strong>
              </>
            ) : (
              <>
                Tap <strong>Add to Home screen</strong> (or{" "}
                <strong>Install app</strong>)
              </>
            )}
          </Step>
          <Step n={3}>
            Open <strong>LP</strong> from your home screen
          </Step>
        </ol>
      )}

      {/* Escape hatch */}
      <button
        onClick={dismiss}
        style={{
          marginTop: 28,
          appearance: "none",
          border: "none",
          background: "transparent",
          color: "#9ca3af",
          fontSize: 13,
          textDecoration: "underline",
          cursor: "pointer",
        }}
      >
        Continue in browser anyway
      </button>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        textAlign: "left",
        fontSize: 15,
        lineHeight: 1.4,
        color: "#374151",
        background: "#f9fafb",
        border: "1px solid #f0f1f3",
        borderRadius: 14,
        padding: "12px 14px",
      }}
    >
      <span
        style={{
          flex: "0 0 auto",
          width: 26,
          height: 26,
          borderRadius: 9999,
          background: "#e31f36",
          color: "#fff",
          fontSize: 14,
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {n}
      </span>
      <span>{children}</span>
    </li>
  );
}

// Rough iOS share glyph so the instruction is unambiguous.
function ShareGlyph() {
  return (
    <svg
      width={15}
      height={15}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#007aff"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: "inline-block", verticalAlign: "-2px" }}
      aria-hidden="true"
    >
      <path d="M12 15V3" />
      <path d="M8 7l4-4 4 4" />
      <path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7" />
    </svg>
  );
}
