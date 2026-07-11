"use client";

import { useEffect, useState } from "react";
import {
  getUser,
  refreshUser,
  updateProfile,
  disconnectMicrosoft,
} from "@/lib/session";
import { brandById, type Brand } from "@/lib/brands";
import { packageById } from "@/lib/packages";
import type { UserProfile } from "@/lib/types";

export default function ProfilePage() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [toast, setToast] = useState("");
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    const u = getUser();
    if (!u) return;
    setUser(u);
    setBrand(brandById(u.brandId) ?? null);
    setName(u.name);
    setMobile(u.mobile);
    // Coming back from the Microsoft consent redirect: the cached user is
    // stale (the connection just changed server-side) — refresh, and turn
    // the query params into a friendly toast.
    const params = new URLSearchParams(window.location.search);
    const emailResult = params.get("email");
    if (emailResult) {
      refreshUser().then((fresh) => fresh && setUser(fresh));
      const crm = params.get("crm");
      const msg =
        emailResult === "connected"
          ? crm === "matched"
            ? "Email connected ✓ — and matched to your CRM account"
            : crm === "nomatch"
              ? "Email connected ✓ (no CRM account found for this address yet)"
              : crm === "differentemail"
                ? "Email connected ✓ — heads up: it's a different address to the one you signed up with"
                : "Email connected ✓"
          : emailResult === "inuse"
            ? "That mailbox is already connected to another account on the portal."
            : emailResult === "notconfigured"
              ? "Email isn't switched on for the portal yet — we're on it."
              : "Couldn't connect your email — please try again.";
      setToast(msg);
      setTimeout(() => setToast(""), 6000);
      window.history.replaceState({}, "", "/dashboard/profile");
    }
  }, []);

  if (!user || !brand) return null;

  async function save() {
    if (!user) return;
    const next = await updateProfile({ name: name.trim(), mobile: mobile.trim() });
    if (next) setUser(next);
    setToast("Profile saved ✓");
    setTimeout(() => setToast(""), 2500);
  }

  function handlePhoto(file: File | null) {
    if (!file || !user) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const next = await updateProfile({ photo: reader.result as string });
      if (next) setUser(next);
    };
    reader.readAsDataURL(file);
  }

  const pkg = packageById(user.packageId);

  // Backup ask: whatever we couldn't pull from their Microsoft account. Mobile
  // matters most (it drives lead alerts), so it's called out clearly.
  const needsMobile = !user.mobile?.trim();
  const needsPhoto = !user.photo;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-3xl font-semibold tracking-tight">Profile</h1>

      {(needsMobile || needsPhoto) && (
        <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-sm font-semibold text-amber-900">
            Finish setting up
          </p>
          <p className="mt-1 text-sm text-amber-800/80">
            We pulled what we could from your email
            {needsMobile && needsPhoto
              ? " — but couldn't find a mobile number or a headshot."
              : needsMobile
                ? " — but couldn't find a mobile number."
                : " — but couldn't find a headshot."}
          </p>
          <div className="mt-4 space-y-3">
            {needsMobile && (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-amber-900">
                  Mobile number{" "}
                  <span className="font-normal text-amber-700/70">
                    — so you get a text the moment a lead lands
                  </span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="tel"
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                    placeholder="07700 900000"
                    className="flex-1 rounded-lg border border-amber-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-amber-500"
                  />
                  <button
                    onClick={save}
                    disabled={!mobile.trim()}
                    className="rounded-lg px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40"
                    style={{ backgroundColor: brand.accent }}
                  >
                    Save
                  </button>
                </div>
              </div>
            )}
            {needsPhoto && (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-amber-900">
                  Headshot{" "}
                  <span className="font-normal text-amber-700/70">
                    — used on your dashboard and ad creatives
                  </span>
                </label>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-amber-300 bg-white px-4 py-2.5 text-sm font-medium text-amber-900 transition hover:bg-amber-100">
                  Upload a headshot
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handlePhoto(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>
            )}
          </div>
        </section>
      )}

      <section className="mt-6 rounded-2xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center gap-5">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-gray-100 text-2xl font-semibold text-gray-500">
            {user.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.photo}
                alt={user.name}
                className="h-full w-full object-cover"
              />
            ) : (
              user.name.charAt(0).toUpperCase()
            )}
          </div>
          <div>
            <label className="cursor-pointer rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50">
              Change photo
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handlePhoto(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
        </div>

        <div className="mt-8 space-y-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Name
            </label>
            <input
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-gray-900"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              disabled
              className="w-full rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5 text-sm text-gray-400"
              value={user.email}
            />
            <p className="mt-1 text-xs text-gray-400">
              Your email decides which business portal you belong to, so it
              can't be changed here.
            </p>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Mobile
            </label>
            <input
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-gray-900"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
            />
          </div>
          <button
            onClick={save}
            className="rounded-lg px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
            style={{ backgroundColor: brand.accent }}
          >
            Save changes
          </button>
        </div>
      </section>

      {/* Email sending — connect the agent's own Microsoft mailbox so lead
          emails go out as them (and land in their Sent items). */}
      <section className="mt-6 rounded-2xl border border-gray-200 shadow-sm p-6">
        <h2 className="font-semibold">Email sending</h2>
        <p className="mt-1 text-sm text-gray-500">
          Connect your work email to send lead emails straight from the
          portal — they go out from your own address.
        </p>
        {user.msEmail ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-green-50 p-4">
            <div>
              <p className="text-sm font-medium text-green-800">
                ✓ Connected as {user.msEmail}
              </p>
              {user.msConnectedAt && (
                <p className="mt-0.5 text-xs text-green-700/70">
                  since{" "}
                  {new Date(user.msConnectedAt).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              )}
            </div>
            <button
              disabled={disconnecting}
              onClick={async () => {
                setDisconnecting(true);
                const next = await disconnectMicrosoft();
                setDisconnecting(false);
                if (next) {
                  setUser(next);
                  setToast("Email disconnected");
                  setTimeout(() => setToast(""), 3000);
                }
              }}
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
            >
              {disconnecting ? "Disconnecting…" : "Disconnect"}
            </button>
          </div>
        ) : (
          <a
            href="/api/auth/microsoft/start"
            className="mt-4 inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
            style={{ backgroundColor: brand.accent }}
          >
            <svg viewBox="0 0 21 21" className="h-4 w-4" aria-hidden>
              <rect x="1" y="1" width="9" height="9" fill="#fff" opacity="0.9" />
              <rect x="11" y="1" width="9" height="9" fill="#fff" opacity="0.7" />
              <rect x="1" y="11" width="9" height="9" fill="#fff" opacity="0.7" />
              <rect x="11" y="11" width="9" height="9" fill="#fff" opacity="0.5" />
            </svg>
            Connect with Microsoft
          </a>
        )}
      </section>

      <section className="mt-6 rounded-2xl border border-gray-200 shadow-sm p-6">
        <h2 className="font-semibold">Subscription</h2>
        <div className="mt-4 flex items-center justify-between rounded-xl bg-gray-50 p-4">
          <div>
            <p className="text-sm font-medium">{pkg?.name} package</p>
            <p className="text-xs text-gray-400">
              {brand.name} · £{pkg?.price}/month
            </p>
          </div>
          {/* TODO(stripe): link to the Stripe customer portal */}
          <button className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs font-medium text-gray-500">
            Manage billing (coming soon)
          </button>
        </div>
      </section>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-gray-900 px-5 py-3 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
