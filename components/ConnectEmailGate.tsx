"use client";

// Full-screen blocker: link your work email before you can use the portal.
//
// This is an IDENTITY check, not a convenience. Launch accounts are created for
// people in advance and all share one starter password, so up to that point
// "signed in" only proves someone knew a password that several people were
// given. Signing in to Microsoft with their own work address is what proves
// they are who the account says they are.
//
// It also happens to switch on sending mail from their own address, which is
// why the copy leads with what they get rather than with the security reason.
//
// IT MUST HAVE A WAY OUT. Without one this is a trap: a blocking overlay with
// a single button, no navigation and no sign-out, so anyone who can't complete
// the Microsoft step is locked out of their own account with nothing to click.
// That happened to a tester AND to James on 4 Aug 2026.
//
// So there are two exits:
//   ✕ dismiss  — closes it and lets them use the account normally
//   sign out   — clears the session and returns to the landing page
//
// DISMISS IS TEMPORARY (James, 5 Aug 2026), for the agent demo. Be honest about
// what it costs: with a dismissible gate the identity check is effectively OFF.
// "Signed in" goes back to meaning "knew the shared launch password", which
// several people were given — the same hole that already exists on mobile, now
// on desktop too. This needs a decision before the wider release: either the
// Microsoft flow gets fixed, or per-person passwords replace the shared one.
//
// TEMPORARY (James, 4 Aug 2026): DESKTOP ONLY. The Microsoft round trip hasn't
// been worked through on mobile yet, and on a phone this gate is a dead end —
// there's no way past it. So below `lg` it doesn't render and the portal opens
// as normal.
//
// Be clear about what that costs: on mobile, "signed in" goes back to meaning
// "knew the shared launch password", which several people were given. The
// identity check is genuinely absent there, not merely deferred. Put it back
// as soon as the mobile Microsoft flow is sorted — this is a stopgap for
// testing, not a decision that mobile doesn't need proving who you are.

import { useState } from "react";
import { signOut } from "@/lib/session";
import type { UserProfile } from "@/lib/types";

export default function ConnectEmailGate({
  user,
  accent,
  onDismiss,
}: {
  user: UserProfile;
  accent: string;
  onDismiss: () => void;
}) {
  /* They connected a mailbox, but not this account's. Say so plainly —
     otherwise the gate reappears after a successful-looking Microsoft
     sign-in and looks broken rather than deliberate. */
  const wrongMailbox =
    !!user.msEmail &&
    user.msEmail.trim().toLowerCase() !== user.email.trim().toLowerCase();
  const [going, setGoing] = useState(false);
  const [leaving, setLeaving] = useState(false);

  return (
    <div className="fixed inset-0 z-[100] hidden items-center justify-center bg-gray-950/60 p-4 backdrop-blur-sm lg:flex">
      <div className="relative w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl">
        {/* The escape hatch. Temporary — see the note at the top of this file. */}
        <button
          onClick={onDismiss}
          aria-label="Close"
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <span
          className="flex h-12 w-12 items-center justify-center rounded-2xl text-2xl"
          style={{ backgroundColor: `${accent}1a` }}
        >
          ✉️
        </span>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">
          Link up your email
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-500">
          Sign in with your work email to finish setting up. It confirms
          it&apos;s really you, and lets you email leads straight from Launch
          Pad using your own address.
        </p>
        {wrongMailbox ? (
          <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            You signed in with{" "}
            <span className="font-medium">{user.msEmail}</span>, but this
            account is{" "}
            <span className="font-medium">{user.email}</span>. Use that address
            to confirm it&apos;s you.
          </p>
        ) : (
          <p className="mt-3 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
            Signing in as{" "}
            <span className="font-medium text-gray-900">{user.email}</span>
          </p>
        )}
        <button
          onClick={() => {
            setGoing(true);
            window.location.href = "/api/auth/microsoft/start";
          }}
          disabled={going}
          className="mt-6 w-full rounded-xl py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          style={{ backgroundColor: accent }}
        >
          {going ? "Opening Microsoft…" : "Continue with Microsoft"}
        </button>
        <p className="mt-3 text-center text-xs text-gray-400">
          We never see your password — Microsoft handles the sign-in.
        </p>

        {/* The way out. Not an alternative to connecting — the gate is still
            there next time — but nobody should be stuck on a screen with one
            button that didn't work for them. */}
        <div className="mt-6 border-t border-gray-100 pt-4 text-center">
          <button
            onClick={async () => {
              setLeaving(true);
              await signOut();
              window.location.href = "/";
            }}
            disabled={leaving || going}
            className="text-sm font-medium text-gray-500 underline-offset-4 hover:text-gray-900 hover:underline disabled:opacity-50"
          >
            {leaving ? "Signing out…" : "Not now — sign out"}
          </button>
          <p className="mt-1.5 text-xs text-gray-400">
            You&apos;ll be asked again next time you sign in.
          </p>
        </div>
      </div>
    </div>
  );
}
