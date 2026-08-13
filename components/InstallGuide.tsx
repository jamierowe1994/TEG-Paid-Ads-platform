"use client";

// "Have you got the app?" — the nudge, and the walkthrough behind it.
//
// Agents overwhelmingly aren't installing the PWA (James, 13 Aug), and the
// app is where Launch Pad actually works: full screen, and the only place a
// lead alert can open the lead itself (iOS never lets a link open a
// home-screen app — see PushSetup). So the prompt sits ABOVE their name in
// the sidebar — everything below the name is settings and sign-out, and this
// isn't that — the whole card is one tap, and opening it is also what
// dismisses it for good. Profile keeps it reachable afterwards.
//
// The illustrations are DRAWN, not screenshotted, and deliberately so: half
// these steps are iOS's own share sheet, which no web page can capture, so a
// screenshot guide would be part photo / part mock anyway. Drawn panels stay
// sharp at any size, follow the brand colour, add nothing to the bundle, and
// can't go stale the way a screenshot of last month's dashboard does.

import { useEffect, useState } from "react";

const SEEN_KEY = "teg-install-guide-seen";

/* Is this already the installed app? Then the whole thing is moot — never
   nag someone who has already done it. */
function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/* ── The prompt ─────────────────────────────────────────────────────────── */

export function InstallPrompt({ accent }: { accent: string }) {
  const [show, setShow] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    try {
      if (localStorage.getItem(SEEN_KEY)) return;
    } catch {
      /* storage blocked — showing it once is the lesser evil */
    }
    setShow(true);
  }, []);

  /* Persisting "seen" and HIDING the card are separate on purpose. The card
     renders the guide, so hiding it on tap unmounted the guide before it
     could appear — the first cut did exactly that and the guide never
     opened. Remember it on tap; hide the card once the guide is closed. */
  function markSeen() {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  if (!show) return null;
  return (
    <>
      {/* The whole card is the button — no "Show me how" / "No thanks" pair
          (James, 13 Aug). Opening the guide IS the dismissal: they've seen
          it, so it doesn't come back, and Profile keeps it reachable. */}
      <button
        onClick={() => {
          markSeen();
          setOpen(true);
        }}
        className="mb-4 w-full rounded-2xl border border-gray-200 bg-white p-3.5 text-left transition hover:border-gray-300 active:scale-[0.99]"
      >
        <p className="text-[13px] font-semibold text-gray-900">
          📲 Got the app yet?
        </p>
        <p className="mt-1 text-[12px] leading-relaxed text-gray-500">
          Full screen, and lead alerts open straight on the lead. Tap to see how.
        </p>
      </button>
      {open && (
        <InstallGuide
          accent={accent}
          onClose={() => {
            setOpen(false);
            setShow(false);
          }}
        />
      )}
    </>
  );
}

/* ── The guide ──────────────────────────────────────────────────────────── */

export default function InstallGuide({
  accent,
  onClose,
}: {
  accent: string;
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);
  const steps = STEPS(accent);
  const s = steps[step];
  const last = step === steps.length - 1;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-gray-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-white pb-[env(safe-area-inset-bottom)] sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: where you are, and the way out */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              Step {step + 1} of {steps.length}
            </p>
            <p className="truncate text-[15px] font-semibold text-gray-900">
              {s.title}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-full p-2 text-gray-400 hover:bg-gray-100"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {/* Progress */}
        <div className="h-1 w-full bg-gray-100">
          <div
            className="h-full transition-all duration-300"
            style={{
              width: `${((step + 1) / steps.length) * 100}%`,
              backgroundColor: accent,
            }}
          />
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-6">
          <div className="mx-auto w-full max-w-[260px]">{s.art}</div>
          <p className="mt-6 text-[15px] leading-relaxed text-gray-700">{s.body}</p>
          {s.note && (
            <p className="mt-3 rounded-xl bg-gray-50 px-3.5 py-2.5 text-[13px] leading-relaxed text-gray-500">
              {s.note}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-gray-100 px-5 py-4">
          {step > 0 && (
            <button
              onClick={() => setStep((n) => n - 1)}
              className="rounded-full border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-600"
            >
              Back
            </button>
          )}
          <button
            onClick={() => (last ? onClose() : setStep((n) => n + 1))}
            className="flex-1 rounded-full py-3 text-sm font-semibold text-white transition active:scale-[0.98]"
            style={{ backgroundColor: accent }}
          >
            {last ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Steps ──────────────────────────────────────────────────────────────── */

function STEPS(accent: string) {
  return [
    {
      title: "Open it on your phone",
      art: <ArtSafari accent={accent} />,
      body: (
        <>
          On your phone, open <strong>Safari</strong> and go to{" "}
          <strong>launchpad.theexpertsgroup.co.uk</strong>. Sign in as normal.
        </>
      ),
      note: "It has to be Safari on an iPhone — Chrome on iOS can't add apps to the home screen. On Android, use Chrome.",
    },
    {
      title: "Tap Share",
      art: <ArtShareButton accent={accent} />,
      body: (
        <>
          Tap the <strong>Share</strong> button — the square with an arrow
          pointing up. It&apos;s at the bottom of the screen on newer iPhones,
          top-right on older ones.
        </>
      ),
    },
    {
      title: "Add to Home Screen",
      art: <ArtAddToHome accent={accent} />,
      body: (
        <>
          Scroll down the list and tap{" "}
          <strong>Add to Home Screen</strong>, then <strong>Add</strong> in the
          top corner.
        </>
      ),
      note: "On Android it's the ⋮ menu → Install app / Add to Home screen.",
    },
    {
      title: "Open it from your home screen",
      art: <ArtHomeIcon accent={accent} />,
      body: (
        <>
          Close Safari and open <strong>Launch Pad</strong> from your home
          screen. It fills the whole screen — no address bar.
        </>
      ),
      note: "Sign in once more here. The app has its own memory, so signing in inside Safari doesn't carry over.",
    },
    {
      title: "Turn on lead alerts",
      art: <ArtAlerts accent={accent} />,
      body: (
        <>
          A banner appears at the bottom: <strong>Get lead alerts on this
          phone</strong>. Tap <strong>Turn on</strong>, then <strong>Allow</strong>{" "}
          when your phone asks.
        </>
      ),
      note: "This is the bit that matters: a tapped alert opens that exact lead inside the app. Without it you'll only get the WhatsApp message, which opens Safari.",
    },
    {
      title: "Check it works",
      art: <ArtDone accent={accent} />,
      body: (
        <>
          Tap <strong>Send a test</strong> on the same banner. A notification
          should arrive — tapping it should open your leads.
        </>
      ),
      note: "You can turn alerts off any time in Profile → Notifications.",
    },
  ];
}

/* ── Illustrations ──────────────────────────────────────────────────────── */

function Phone({ children, accent }: { children: React.ReactNode; accent?: string }) {
  return (
    <div className="mx-auto w-[190px] rounded-[26px] border-[6px] border-gray-900 bg-white shadow-xl">
      <div className="relative h-[330px] overflow-hidden rounded-[20px]" style={{ backgroundColor: "#f4f4f5" }}>
        {/* island */}
        <div className="absolute left-1/2 top-2 h-3.5 w-14 -translate-x-1/2 rounded-full bg-gray-900" />
        {children}
      </div>
      {accent ? null : null}
    </div>
  );
}

function MiniDash({ accent }: { accent: string }) {
  return (
    <div className="px-3 pt-8">
      <div className="h-2 w-16 rounded bg-gray-300" />
      <div className="mt-2 h-4 w-24 rounded bg-gray-800" />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-white p-2">
          <div className="h-4 w-5 rounded" style={{ backgroundColor: accent }} />
          <div className="mt-1 h-1.5 w-12 rounded bg-gray-200" />
        </div>
        <div className="rounded-lg bg-white p-2">
          <div className="h-4 w-5 rounded bg-gray-800" />
          <div className="mt-1 h-1.5 w-10 rounded bg-gray-200" />
        </div>
      </div>
      <div className="mt-2 rounded-lg bg-white p-2">
        <div className="h-1.5 w-14 rounded bg-gray-300" />
        <div className="mt-2 flex items-end gap-1">
          {[6, 12, 8, 16, 10, 4, 7].map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-sm"
              style={{ height: h, backgroundColor: i === 3 ? accent : "#d1d5db" }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ArtSafari({ accent }: { accent: string }) {
  return (
    <Phone>
      <div className="absolute inset-x-0 top-7 flex justify-center">
        <div className="flex w-[150px] items-center gap-1 rounded-full bg-white px-2 py-1 shadow-sm">
          <span className="text-[7px] text-gray-400">🔒</span>
          <span className="truncate text-[7px] text-gray-700">
            launchpad.theexpertsgroup.co.uk
          </span>
        </div>
      </div>
      <div className="pt-4">
        <MiniDash accent={accent} />
      </div>
    </Phone>
  );
}

function ArtShareButton({ accent }: { accent: string }) {
  return (
    <Phone>
      <div className="pt-4">
        <MiniDash accent={accent} />
      </div>
      {/* Safari's bottom bar, with the share icon called out */}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-around border-t border-gray-200 bg-gray-100 px-3 py-2.5">
        <span className="text-[10px] text-gray-400">‹</span>
        <span className="text-[10px] text-gray-400">›</span>
        <span className="relative">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke={accent} strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15V4m0 0L8.5 7.5M12 4l3.5 3.5" />
            <path strokeLinecap="round" d="M5 13v5.5A1.5 1.5 0 006.5 20h11a1.5 1.5 0 001.5-1.5V13" />
          </svg>
          <span
            className="absolute -inset-2 animate-pulse rounded-full border-2"
            style={{ borderColor: accent }}
          />
        </span>
        <span className="text-[10px] text-gray-400">⧉</span>
        <span className="text-[10px] text-gray-400">⊞</span>
      </div>
    </Phone>
  );
}

function ArtAddToHome({ accent }: { accent: string }) {
  return (
    <Phone>
      <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white p-3 shadow-2xl">
        <div className="mx-auto h-1 w-10 rounded-full bg-gray-300" />
        {["Copy", "Add to Reading List", "Add Bookmark"].map((t) => (
          <div key={t} className="flex items-center justify-between border-b border-gray-100 py-2">
            <span className="text-[8px] text-gray-500">{t}</span>
            <span className="text-[8px] text-gray-300">▢</span>
          </div>
        ))}
        {/* the one they want */}
        <div
          className="mt-1 flex items-center justify-between rounded-lg px-2 py-2"
          style={{ backgroundColor: `${accent}18`, outline: `2px solid ${accent}` }}
        >
          <span className="text-[8px] font-bold" style={{ color: accent }}>
            Add to Home Screen
          </span>
          <span className="text-[9px]" style={{ color: accent }}>
            ⊞
          </span>
        </div>
        <div className="flex items-center justify-between py-2">
          <span className="text-[8px] text-gray-500">Markup</span>
          <span className="text-[8px] text-gray-300">✎</span>
        </div>
      </div>
    </Phone>
  );
}

function ArtHomeIcon({ accent }: { accent: string }) {
  return (
    <Phone>
      <div className="grid grid-cols-4 gap-3 px-4 pt-10">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="aspect-square rounded-xl bg-gray-300/70" />
        ))}
        {/* ours, highlighted */}
        <div className="relative">
          <div
            className="grid aspect-square place-items-center rounded-xl text-white shadow-lg"
            style={{ backgroundColor: "#16171a" }}
          >
            <span className="text-[13px]">🚀</span>
          </div>
          <span
            className="absolute -inset-1.5 animate-pulse rounded-2xl border-2"
            style={{ borderColor: accent }}
          />
        </div>
      </div>
      <p className="mt-3 text-center text-[7px] font-medium text-gray-500">
        Launch Pad
      </p>
    </Phone>
  );
}

function ArtAlerts({ accent }: { accent: string }) {
  return (
    <Phone>
      <div className="pt-4">
        <MiniDash accent={accent} />
      </div>
      {/* the real banner, in miniature */}
      <div className="absolute inset-x-2 bottom-4 flex items-center gap-2 rounded-xl border border-gray-200 bg-white p-2 shadow-lg">
        <span className="flex-1 text-[7px] font-semibold text-gray-900">
          Get lead alerts on this phone
        </span>
        <span
          className="rounded-full px-2 py-1 text-[7px] font-semibold text-white"
          style={{ backgroundColor: accent }}
        >
          Turn on
        </span>
      </div>
    </Phone>
  );
}

function ArtDone({ accent }: { accent: string }) {
  return (
    <Phone>
      {/* a notification, arriving */}
      <div className="absolute inset-x-2 top-7 rounded-xl bg-white/95 p-2 shadow-lg backdrop-blur">
        <div className="flex items-center gap-1.5">
          <span className="grid h-3.5 w-3.5 place-items-center rounded bg-gray-900 text-[6px]">
            🚀
          </span>
          <span className="text-[7px] font-semibold text-gray-900">Launch Pad</span>
          <span className="ml-auto text-[6px] text-gray-400">now</span>
        </div>
        <p className="mt-1 text-[7px] font-medium text-gray-800">New lead 🎉</p>
        <p className="text-[6.5px] text-gray-500">
          Priya Nair just came in — first two hours count double.
        </p>
      </div>
      <div className="pt-24">
        <MiniDash accent={accent} />
      </div>
      <div
        className="absolute inset-x-0 bottom-3 mx-auto w-fit rounded-full px-3 py-1 text-[7px] font-semibold text-white"
        style={{ backgroundColor: accent }}
      >
        Tap it → opens the lead
      </div>
    </Phone>
  );
}
