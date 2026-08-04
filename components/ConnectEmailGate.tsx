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
// Deliberately has no "Later". The skippable prompt on the Overview page is
// the right shape for someone who already proved who they are at signup; it is
// the wrong shape for an account that was handed to them.

import { useState } from "react";
import type { UserProfile } from "@/lib/types";

export default function ConnectEmailGate({
  user,
  accent,
}: {
  user: UserProfile;
  accent: string;
}) {
  const [going, setGoing] = useState(false);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-950/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl">
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
        <p className="mt-3 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
          Signing in as{" "}
          <span className="font-medium text-gray-900">{user.email}</span>
        </p>
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
      </div>
    </div>
  );
}
