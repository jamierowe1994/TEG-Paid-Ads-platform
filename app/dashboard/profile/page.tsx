"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getUser,
  refreshUser,
  updateProfile,
  upgradeAccount,
  openBillingPortal,
  disconnectMicrosoft,
  cancelSubscription,
  deleteAccount,
  changePassword,
} from "@/lib/session";
import { brandById, type Brand } from "@/lib/brands";
import { packageById, PACKAGES, adSpendCapFor } from "@/lib/packages";
import type { UserProfile } from "@/lib/types";

// Card styling shared across the page. Desktop is outline-only on the page's
// own surface, matching Overview and Leads; mobile keeps a white card with a
// soft drop shadow, where the cards are the only structure there is.
const CARD =
  "rounded-2xl border border-gray-300 bg-white p-6 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.12)] lg:rounded-xl lg:border-gray-900/[0.13] lg:bg-transparent lg:shadow-none";

// Monthly anniversary of the signup date, on or after today — the next time
// they'd be billed on a rolling monthly plan.
function nextBillingDate(createdAt: string): Date {
  const start = new Date(createdAt);
  const day = start.getDate();
  const now = new Date();
  let d = new Date(now.getFullYear(), now.getMonth(), day);
  if (d < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
    d = new Date(now.getFullYear(), now.getMonth() + 1, day);
  }
  return d;
}

function fmtDate(d: Date | string): string {
  return new Date(d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [location, setLocation] = useState("");
  const [upgradePkg, setUpgradePkg] = useState("growth");
  const [upgrading, setUpgrading] = useState(false);
  const [upgradeError, setUpgradeError] = useState("");
  const [toast, setToast] = useState("");
  const [disconnecting, setDisconnecting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [openingBilling, setOpeningBilling] = useState(false);
  const [billingError, setBillingError] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  // Change password
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState("");

  useEffect(() => {
    const u = getUser();
    if (!u) return;
    setUser(u);
    setBrand(brandById(u.brandId) ?? null);
    setName(u.name);
    setMobile(u.mobile);
    setLocation(u.location ?? "");
    // Coming back from the Microsoft consent redirect: the cached user is
    // stale (the connection just changed server-side) — refresh, and turn
    // the query params into a friendly toast.
    const params = new URLSearchParams(window.location.search);
    const emailResult = params.get("email");
    if (emailResult) {
      refreshUser().then((fresh) => {
        if (fresh) {
          setUser(fresh);
          setMobile(fresh.mobile);
          setLocation(fresh.location ?? "");
        }
      });
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
    const next = await updateProfile({
      name: name.trim(),
      mobile: mobile.trim(),
      location: location.trim(),
    });
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

  async function goToBilling() {
    if (openingBilling) return;
    setBillingError("");
    setOpeningBilling(true);
    const { url, error } = await openBillingPortal();
    if (url) {
      window.location.href = url;
      return;
    }
    setOpeningBilling(false);
    setBillingError(error ?? "Couldn't open billing.");
  }

  async function toggleCancel(cancel: boolean) {
    setCancelling(true);
    const next = await cancelSubscription(cancel);
    setCancelling(false);
    setConfirmCancel(false);
    if (next) {
      setUser(next);
      setToast(
        cancel
          ? "Cancellation requested — the team will be in touch."
          : "Subscription resumed ✓"
      );
      setTimeout(() => setToast(""), 3500);
    }
  }

  async function submitPassword() {
    setPwError("");
    if (pwNew.length < 8) {
      setPwError("Your new password must be at least 8 characters.");
      return;
    }
    if (pwNew !== pwConfirm) {
      setPwError("The two new passwords don't match.");
      return;
    }
    setPwSaving(true);
    const res = await changePassword(pwCurrent, pwNew);
    setPwSaving(false);
    if (res.ok) {
      setPwCurrent("");
      setPwNew("");
      setPwConfirm("");
      setToast("Password changed ✓");
      setTimeout(() => setToast(""), 3000);
    } else {
      setPwError(res.error ?? "Couldn't change password.");
    }
  }

  async function confirmDelete() {
    setDeleting(true);
    setDeleteError("");
    const res = await deleteAccount(deleteConfirm.trim());
    setDeleting(false);
    if (res.ok) {
      router.replace("/login");
    } else {
      setDeleteError(res.error ?? "Couldn't delete — please try again.");
    }
  }

  const pkg = packageById(user.packageId);
  const cancelled = !!user.cancelRequestedAt;
  /* The pack sells a 3-month minimum term. Stripe has no concept of one, so
     the commitment date is stamped on the account at first payment and read
     here — without this it was being recorded and never enforced. */
  const commitmentEnds = user.commitmentEndsAt
    ? new Date(user.commitmentEndsAt)
    : null;
  const inMinimumTerm = !!commitmentEnds && commitmentEnds.getTime() > Date.now();
  /* Stripe's real period end when we have it; the signup-anniversary guess is
     only a fallback for accounts that never went through checkout. */
  const nextBill = user.renewsAt
    ? new Date(user.renewsAt)
    : nextBillingDate(user.createdAt);
  const isReferral = user.accountType === "referral";
  /* Paid Ads bundled into a licence rather than bought as a package — TLE's
     Pro tier. These accounts sit on the default "starter" package because
     they never picked one, so every package figure (price, management fee,
     ad spend) is meaningless for them and reads as a bill they don't owe. */
  const licenceIncluded = !isReferral && user.brandId === "lettings";
  const adCap = adSpendCapFor(user.brandId, user.packageId);

  async function doUpgrade() {
    if (upgrading || !user) return;
    setUpgradeError("");
    setUpgrading(true);
    const res = await upgradeAccount(upgradePkg);
    // With Stripe live the server hands back a Checkout URL — the account
    // isn't upgraded until the webhook confirms payment, so send them to pay
    // rather than celebrating here.
    if (res.ok && res.url) {
      window.location.href = res.url;
      return;
    }
    setUpgrading(false);
    if (res.ok && res.user) {
      setUser(res.user);
      setToast("You're on Paid Ads now — everything's unlocked ✓");
      setTimeout(() => setToast(""), 4000);
    } else {
      setUpgradeError(res.error ?? "Couldn't upgrade — please try again.");
    }
  }

  // Backup ask: whatever we couldn't pull from their Microsoft account. Mobile
  // matters most (it drives lead alerts), so it's called out clearly.
  const needsMobile = !user.mobile?.trim();
  const needsPhoto = !user.photo;

  const inputClass =
    "w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-gray-900";

  return (
    <div className="w-full">
      {/* Header — title left, billing summary top-right */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Profile &amp; billing
          </h1>
          <p className="mt-1 text-gray-500">
            Your details and everything to do with your plan.
          </p>
        </div>
        <div className="rounded-2xl border border-gray-300 bg-white px-5 py-3 text-right shadow-[0_2px_8px_-2px_rgba(0,0,0,0.12)] lg:rounded-xl lg:border-gray-900/[0.13] lg:bg-transparent lg:shadow-none">
          {isReferral ? (
            <>
              <p className="text-lg font-semibold tracking-tight">Referrals</p>
              <p className="mt-0.5 text-xs font-semibold text-green-600">
                Free plan
              </p>
            </>
          ) : licenceIncluded ? (
            <>
              <p className="text-lg font-semibold tracking-tight">Paid Ads</p>
              <p className="mt-0.5 text-xs font-semibold text-green-600">
                Included with your Pro licence
              </p>
            </>
          ) : (
            <>
              <p className="text-2xl font-semibold tracking-tight">
                £{pkg?.price}
                <span className="text-sm font-normal text-gray-400">/mo</span>
              </p>
              <p className="mt-0.5 text-xs text-gray-500">
                {cancelled ? "Ends" : "Next bill"} {fmtDate(nextBill)}
              </p>
            </>
          )}
        </div>
      </div>

      {/* Referrals-only → prominent upgrade to Paid Ads (demo-mode unlock). */}
      {isReferral && (
        <section
          className="mt-6 rounded-2xl border-2 p-6"
          style={{ borderColor: `${brand.accent}66`, backgroundColor: brand.accentSoft }}
        >
          <div className="flex items-start gap-3">
            <span className="text-2xl">📣</span>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold">Upgrade to Paid Ads</h2>
              <p className="mt-1 text-sm text-gray-600">
                You&apos;re on the free Referrals plan. Add Paid Ads to unlock
                your dashboard, leads funnel and campaigns — we build and run
                your paid social and track every lead.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {PACKAGES.map((p) => {
                  const sel = upgradePkg === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setUpgradePkg(p.id)}
                      className={`rounded-xl border-2 bg-white p-4 text-left transition ${
                        sel ? "" : "border-gray-200 hover:border-gray-300"
                      }`}
                      style={sel ? { borderColor: brand.accent } : undefined}
                    >
                      <p className="font-semibold">{p.name}</p>
                      <p className="mt-1 text-lg font-bold">
                        £{p.price}
                        <span className="text-xs font-normal text-gray-400">/mo</span>
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        £{p.adSpend} ad spend
                      </p>
                    </button>
                  );
                })}
              </div>
              <button
                onClick={doUpgrade}
                disabled={upgrading}
                className="mt-4 rounded-xl px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: brand.accent }}
              >
                {upgrading
                  ? "Upgrading…"
                  : `Upgrade to ${packageById(upgradePkg)?.name ?? "Paid Ads"} — go live`}
              </button>
              <p className="mt-2 text-xs text-gray-400">
                Demo mode — no card charged yet. Secure card payment slots in here.
              </p>
              {upgradeError && (
                <p className="mt-2 text-sm text-red-500">{upgradeError}</p>
              )}
            </div>
          </div>
        </section>
      )}

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

      {/* Two columns — profile on the left, billing on the right */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* ── LEFT: your details + email sending ── */}
        <div className="space-y-6">
          <section className={CARD}>
            <h2 className="font-semibold">Your details</h2>
            <div className="mt-5 flex items-center gap-5">
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
              <label className="cursor-pointer rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50">
                Change photo
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handlePhoto(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>

            <div className="mt-6 space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Name
                </label>
                <input
                  className={inputClass}
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
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-400"
                  value={user.email}
                />
                <p className="mt-1 text-xs text-gray-400">
                  Your email decides which business portal you belong to, so it
                  can&apos;t be changed here.
                </p>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Mobile
                </label>
                <input
                  className={inputClass}
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  placeholder="07700 900000"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Area you cover
                </label>
                <input
                  className={inputClass}
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Liverpool"
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

          {/* Email sending — connect the agent's own Microsoft mailbox */}
          <section className={CARD}>
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
                      since {fmtDate(user.msConnectedAt)}
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
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
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

          {/* Change password — self-service, needs the current one first */}
          <section className={CARD}>
            <h2 className="font-semibold">Change password</h2>
            <p className="mt-1 text-sm text-gray-500">
              Set a new password for signing in. You&apos;ll need your current
              one to confirm it&apos;s you.
            </p>
            <div className="mt-4 space-y-3">
              <input
                type="password"
                autoComplete="current-password"
                className={inputClass}
                value={pwCurrent}
                onChange={(e) => setPwCurrent(e.target.value)}
                placeholder="Current password"
              />
              <input
                type="password"
                autoComplete="new-password"
                className={inputClass}
                value={pwNew}
                onChange={(e) => setPwNew(e.target.value)}
                placeholder="New password (at least 8 characters)"
              />
              <input
                type="password"
                autoComplete="new-password"
                className={inputClass}
                value={pwConfirm}
                onChange={(e) => setPwConfirm(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitPassword()}
                placeholder="Confirm new password"
              />
            </div>
            {pwError && <p className="mt-2 text-sm text-red-600">{pwError}</p>}
            <button
              onClick={submitPassword}
              disabled={
                pwSaving || !pwCurrent || !pwNew || !pwConfirm
              }
              className="mt-4 rounded-lg px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40"
              style={{ backgroundColor: brand.accent }}
            >
              {pwSaving ? "Saving…" : "Update password"}
            </button>
          </section>
        </div>

        {/* ── RIGHT: plan, payment, danger zone ── */}
        <div className="space-y-6">
          {/* Your plan */}
          <section className={CARD}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">Your plan</h2>
                <p className="mt-0.5 text-xs text-gray-400">
                  {brand.name}
                </p>
              </div>
              <span
                className="rounded-full px-3 py-1 text-xs font-semibold text-white"
                style={{ backgroundColor: cancelled ? "#9CA3AF" : brand.accent }}
              >
                {cancelled ? "Cancelling" : "Active"}
              </span>
            </div>

            {/* Licence-included accounts sit on the default "starter" package
                they never chose, so its name, tagline and price are all
                meaningless to them — and a £250/mo next to "Included with your
                Pro licence" reads as a bill they didn't know about. */}
            <div className="mt-4 flex items-end justify-between rounded-xl bg-gray-50 p-4">
              <div>
                <p className="text-lg font-semibold">
                  {licenceIncluded ? "Paid Ads" : `${pkg?.name} package`}
                </p>
                <p className="text-xs text-gray-500">
                  {licenceIncluded
                    ? "Part of your Pro licence"
                    : pkg?.tagline}
                </p>
              </div>
              <p className="text-2xl font-semibold tracking-tight">
                {licenceIncluded ? (
                  <span className="text-base font-semibold text-green-600">
                    Included
                  </span>
                ) : (
                  <>
                    £{pkg?.price}
                    <span className="text-sm font-normal text-gray-400">/mo</span>
                  </>
                )}
              </p>
            </div>

            {/* Where the money goes */}
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-gray-200 p-3">
                <p className="text-xs text-gray-400">Management fee</p>
                <p className="mt-0.5 font-semibold">
                  {licenceIncluded ? "Included" : `£${pkg?.managementFee}/mo`}
                </p>
              </div>
              <div className="rounded-xl border border-gray-200 p-3">
                <p className="text-xs text-gray-400">Ad spend to Meta</p>
                <p className="mt-0.5 font-semibold">£{adCap}/mo</p>
              </div>
            </div>

            {/* No payment is due, so there is no next one to name. */}
            {!licenceIncluded && (
              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="text-gray-500">
                  {cancelled ? "Access ends" : "Next payment"}
                </span>
                <span className="font-medium">{fmtDate(nextBill)}</span>
              </div>
            )}

            {pkg?.features?.length ? (
              <ul className="mt-4 space-y-1.5 border-t border-gray-100 pt-4 text-sm text-gray-600">
                {pkg.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <span style={{ color: brand.accent }}>✓</span>
                    {f}
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="mt-5">
              <button
                disabled
                className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2.5 text-sm font-medium text-gray-400"
              >
                Change plan (coming with card payments)
              </button>
            </div>
          </section>

          {/* Payment + invoices — handed off to Stripe's hosted portal, so we
              never touch card details and don't rebuild an invoice list. */}
          <section className={CARD}>
            <h2 className="font-semibold">Payment &amp; invoices</h2>
            {user.stripeCustomerId ? (
              <>
                <p className="mt-3 text-sm text-gray-500">
                  Update your card, download invoices and receipts, or change
                  your plan. Handled securely by Stripe — we never see your
                  card details.
                </p>
                <button
                  onClick={goToBilling}
                  disabled={openingBilling}
                  className="mt-4 rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-gray-700 disabled:opacity-40"
                >
                  {openingBilling ? "Opening…" : "Manage billing"}
                </button>
                {billingError && (
                  <p className="mt-3 text-sm text-red-600">{billingError}</p>
                )}
              </>
            ) : licenceIncluded ? (
              /* Their ads come with the Pro licence, so there is no card and
                 never will be. Telling them "once you're on a paid package"
                 implies they're missing a step they don't have. */
              <p className="mt-3 text-sm text-gray-500">
                Nothing to pay here — your Paid Ads are included with your Pro
                licence. Anything to do with the licence itself is handled by
                head office.
              </p>
            ) : (
              <p className="mt-3 text-sm text-gray-500">
                No billing set up on this account yet. Once you&apos;re on a
                paid package your card, invoices and receipts all live here.
              </p>
            )}
          </section>

          {/* Danger zone — cancel + delete */}
          <section className="rounded-2xl border border-red-200 bg-red-50/40 p-6">
            <h2 className="font-semibold text-red-800">Manage subscription</h2>

            {/* Cancel / resume.
                Hidden entirely for licence-included accounts: there is no
                subscription to cancel. Their Paid Ads comes with the Pro
                licence, and a licence isn't something you end from a settings
                page — pressing this would either do nothing or start a
                cancellation for a subscription that doesn't exist. Deleting
                the account is still available below. */}
            {licenceIncluded ? (
              <p className="mt-4 rounded-xl border border-red-200 bg-white p-4 text-sm text-gray-700">
                Your Paid Ads is part of your Pro licence, so there&apos;s no
                separate subscription to cancel here. Anything to do with the
                licence itself goes through head office.
              </p>
            ) : inMinimumTerm && !cancelled ? (
              <div className="mt-4 rounded-xl border border-red-200 bg-white p-4">
                <p className="text-sm text-gray-700">
                  You&apos;re inside the three-month minimum term, which runs
                  until{" "}
                  <span className="font-medium text-gray-900">
                    {fmtDate(user.commitmentEndsAt!)}
                  </span>
                  . Campaigns need that long to settle — it&apos;s why the
                  minimum exists.
                </p>
                <p className="mt-2 text-sm text-gray-700">
                  You can cancel from{" "}
                  <span className="font-medium text-gray-900">
                    {fmtDate(user.commitmentEndsAt!)}
                  </span>
                  , and it&apos;s rolling monthly from then on — cancel any
                  time, and your ads run to the end of the month you&apos;ve
                  paid for.
                </p>
                <p className="mt-2 text-xs text-gray-500">
                  Need to stop sooner? Talk to your Group Marketing Director.
                </p>
              </div>
            ) : cancelled ? (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-medium text-amber-900">
                  Cancellation requested on {fmtDate(user.cancelRequestedAt!)}
                </p>
                <p className="mt-0.5 text-xs text-amber-800/70">
                  Your plan stays active until {fmtDate(nextBill)}. Changed your
                  mind?
                </p>
                <button
                  disabled={cancelling}
                  onClick={() => toggleCancel(false)}
                  className="mt-3 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  {cancelling ? "Resuming…" : "Resume subscription"}
                </button>
              </div>
            ) : confirmCancel ? (
              <div className="mt-4 rounded-xl border border-red-200 bg-white p-4">
                <p className="text-sm text-gray-700">
                  Cancel your {pkg?.name} plan? Your ads keep running until{" "}
                  {fmtDate(nextBill)}, then stop.
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    disabled={cancelling}
                    onClick={() => toggleCancel(true)}
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {cancelling ? "Cancelling…" : "Yes, cancel"}
                  </button>
                  <button
                    onClick={() => setConfirmCancel(false)}
                    className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                  >
                    Keep my plan
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmCancel(true)}
                className="mt-4 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
              >
                Cancel subscription
              </button>
            )}

            {/* Delete account */}
            <div className="mt-6 border-t border-red-200 pt-5">
              <p className="text-sm font-medium text-red-800">
                Delete account
              </p>
              <p className="mt-0.5 text-xs text-red-700/70">
                Permanently removes your account and all your leads. This
                can&apos;t be undone.
              </p>
              <button
                onClick={() => {
                  setDeleteOpen(true);
                  setDeleteConfirm("");
                  setDeleteError("");
                }}
                className="mt-3 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
              >
                Delete my account
              </button>
            </div>
          </section>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {deleteOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4 backdrop-blur-sm"
          onClick={() => !deleting && setDeleteOpen(false)}
        >
          <div
            className="modal-pop w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-red-800">
              Delete your account?
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              This permanently deletes your account, your subscription and every
              lead in your funnel. There&apos;s no going back.
            </p>
            <label className="mt-4 block text-xs font-medium text-gray-600">
              Type <span className="font-semibold">{user.email}</span> to
              confirm
            </label>
            <input
              autoFocus
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder={user.email}
              className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-red-500"
            />
            {deleteError && (
              <p className="mt-2 text-sm text-red-600">{deleteError}</p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setDeleteOpen(false)}
                disabled={deleting}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Keep my account
              </button>
              <button
                onClick={confirmDelete}
                disabled={
                  deleting ||
                  deleteConfirm.trim().toLowerCase() !==
                    user.email.trim().toLowerCase()
                }
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-40"
              >
                {deleting ? "Deleting…" : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-gray-900 px-5 py-3 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
