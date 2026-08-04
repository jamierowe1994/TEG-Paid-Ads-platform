"use client";

import { useEffect, useMemo, useState } from "react";
import { getUser, fetchLeads, changePackage } from "@/lib/session";
import { brandById, type Brand } from "@/lib/brands";
import { PACKAGES, packageById, adSpendCapFor } from "@/lib/packages";

// Grow: show the agent their monthly ad-spend cap, let them model a higher
// spend with a slider, and project how many leads/conversions that would
// generate based on their current performance. Moving tier changes the
// ad-spend line on their Stripe subscription, effective at the next renewal.

const MAX_SPEND = 1000;

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function GrowPage() {
  const [brand, setBrand] = useState<Brand | null>(null);
  /* Ad spend bundled into a licence rather than bought as a package (TLE Pro).
     These accounts sit on the default "starter" package they never chose, so
     every package-derived figure and every upgrade path is wrong for them —
     they can't move tier, because there is no tier. */
  const [licenceIncluded, setLicenceIncluded] = useState(false);
  const [currentSpend, setCurrentSpend] = useState(0);
  const [packageId, setPackageId] = useState("");
  const [leadCount, setLeadCount] = useState(0);
  const [convertedCount, setConvertedCount] = useState(0);
  const [desired, setDesired] = useState(0);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [changing, setChanging] = useState(false);
  const [changeError, setChangeError] = useState("");
  const [changed, setChanged] = useState<string | null>(null);
  // Stripe's real renewal date, so the modal can name the day the new rate
  // starts rather than saying a vague "next renewal".
  const [nextRenewal, setNextRenewal] = useState<string | null>(null);

  useEffect(() => {
    const u = getUser();
    if (!u) return;
    setBrand(brandById(u.brandId) ?? null);
    const cap = adSpendCapFor(u.brandId, u.packageId);
    setLicenceIncluded(u.accountType !== "referral" && u.brandId === "lettings");
    setCurrentSpend(cap);
    setDesired(cap);
    setPackageId(u.packageId);
    setNextRenewal(u.renewsAt ?? null);
    fetchLeads().then((leads) => {
      setLeadCount(leads.length);
      setConvertedCount(
        leads.filter((l) => l.stage === "converted" || l.stage === "pushed")
          .length
      );
    });
  }, []);

  const costPerLead = leadCount > 0 ? currentSpend / leadCount : null;
  const conversionRate = leadCount > 0 ? convertedCount / leadCount : null;

  const projection = useMemo(() => {
    if (costPerLead === null || costPerLead === 0) return null;
    const leads = Math.round(desired / costPerLead);
    const conversions =
      conversionRate !== null ? Math.round(leads * conversionRate) : null;
    return { leads, conversions };
  }, [desired, costPerLead, conversionRate]);

  // The smallest package whose ad spend covers the desired amount.
  const suggestedPackage = useMemo(
    () =>
      [...PACKAGES]
        .sort((a, b) => a.adSpend - b.adSpend)
        .find((p) => p.adSpend >= desired),
    [desired]
  );

  if (!brand) return null;

  const uplift = desired - currentSpend;

  async function confirmChange() {
    if (!suggestedPackage || changing) return;
    setChangeError("");
    setChanging(true);
    const res = await changePackage(suggestedPackage.id);
    setChanging(false);
    if (!res.ok) {
      setChangeError(res.error ?? "Couldn't change your package.");
      return;
    }
    setPackageId(suggestedPackage.id);
    setChanged(res.effectiveFrom ?? null);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-3xl font-semibold tracking-tight">Grow</h1>
      <p className="mt-2 text-gray-500">
        See your ad-spend cap and model what more spend could bring in.
      </p>

      {/* Current cap */}
      <section className="mt-8 rounded-2xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Your monthly ad-spend cap</p>
            <p className="mt-1 text-4xl font-semibold tracking-tight">
              £{currentSpend}
              <span className="text-base font-normal text-gray-400">
                {" "}
                / month
              </span>
            </p>
            <p className="mt-1 text-sm text-gray-400">
              {licenceIncluded
                ? "Included with your Pro licence"
                : `${packageById(packageId)?.name} package`}
            </p>
          </div>
          <div className="text-right text-sm">
            <p className="text-gray-500">Your cost per lead</p>
            <p className="mt-1 text-2xl font-semibold" style={{ color: brand.accent }}>
              {costPerLead === null ? "—" : `£${costPerLead.toFixed(2)}`}
            </p>
            <p className="text-gray-400">
              {conversionRate === null
                ? "No data yet"
                : `${Math.round(conversionRate * 100)}% convert to ${brand.shortName === "Recruitment" ? "appointment" : "MA"}`}
            </p>
          </div>
        </div>
      </section>

      {/* Model higher spend.
          Hidden for licence-included accounts: their spend is fixed by the Pro
          licence, so a slider that models raising it is offering a control
          they don't have. Shown as coming soon instead of quietly absent. */}
      {licenceIncluded ? (
        <section className="mt-6 rounded-2xl border border-gray-200 p-6 shadow-sm">
          <h2 className="font-semibold">Want to spend more?</h2>
          <p className="mt-1 text-sm text-gray-500">
            Your £{currentSpend} a month comes with your Pro licence. Being able
            to raise it from here is coming soon — for now, have a word with
            head office.
          </p>
        </section>
      ) : (
      <section className="mt-6 rounded-2xl border border-gray-200 shadow-sm p-6">
        <h2 className="font-semibold">What could more spend bring in?</h2>
        <p className="mt-1 text-sm text-gray-500">
          Drag to model a higher monthly ad spend.
        </p>

        <div className="mt-6">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-gray-400">£{currentSpend}</span>
            <span className="text-2xl font-semibold">£{desired}/mo</span>
            <span className="text-sm text-gray-400">£{MAX_SPEND}</span>
          </div>
          <input
            type="range"
            min={currentSpend}
            max={MAX_SPEND}
            step={50}
            value={desired}
            onChange={(e) => setDesired(Number(e.target.value))}
            className="mt-3 w-full"
            style={{ accentColor: brand.accent }}
          />
        </div>

        {/* Projection */}
        <div className="mt-6 rounded-xl bg-gray-50 p-5">
          {projection === null ? (
            <p className="text-sm text-gray-500">
              Once your first leads come in, we'll project how many more you'd
              get at higher spend — based on your own numbers.
            </p>
          ) : (
            <p className="text-sm text-gray-600">
              At{" "}
              <span className="font-semibold text-gray-900">£{desired}/mo</span>{" "}
              you could expect around{" "}
              <span
                className="font-semibold"
                style={{ color: brand.accent }}
              >
                {projection.leads} leads
              </span>
              {projection.conversions !== null && (
                <>
                  {" "}
                  and{" "}
                  <span
                    className="font-semibold"
                    style={{ color: brand.accent }}
                  >
                    {projection.conversions} {brand.conversionLabel}
                  </span>
                </>
              )}{" "}
              per month, based on your current cost per lead of £
              {costPerLead!.toFixed(2)}.
            </p>
          )}
        </div>

        {/* Subtle upgrade entry */}
        {uplift > 0 && (
          <div className="mt-6 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              That's £{uplift}/mo more ad spend
              {suggestedPackage &&
                suggestedPackage.id !== packageId &&
                ` · ${suggestedPackage.name} package`}
            </p>
            {/* Licence-included accounts have no package to move, and the
                upgrade path runs through Stripe — which they've never been
                near. Point them at the people who can actually change it. */}
            {licenceIncluded ? (
              <p className="text-sm text-gray-500">
                Your ad spend is set by your Pro licence — talk to head office
                if you want to increase it.
              </p>
            ) : (
              <button
                onClick={() => setShowUpgrade(true)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
                style={{ backgroundColor: brand.accent }}
              >
                Increase my ad spend →
              </button>
            )}
          </div>
        )}
      </section>
      )}

      {/* Upgrade modal → Stripe placeholder */}
      {showUpgrade && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/30 p-6 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold">Increase your ad spend</h2>
            <p className="mt-1 text-sm text-gray-500">
              You're moving to £{desired}/month ad spend
              {suggestedPackage && ` (${suggestedPackage.name} package)`}.
            </p>
            <div className="mt-5 rounded-xl border border-gray-200 p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">New monthly ad spend</span>
                <span className="font-semibold">£{desired}</span>
              </div>
              {projection && (
                <div className="mt-2 flex justify-between">
                  <span className="text-gray-500">Projected leads / mo</span>
                  <span className="font-semibold">~{projection.leads}</span>
                </div>
              )}
            </div>
            {changed !== null ? (
              <div className="mt-5 rounded-xl border border-green-200 bg-green-50 p-4">
                <p className="text-sm font-medium text-green-900">
                  Package changed ✓
                </p>
                <p className="mt-1 text-sm text-green-800/80">
                  {changed
                    ? `Your new rate starts on ${fmtDate(changed)} — nothing is charged today.`
                    : "Your new rate starts at your next renewal — nothing is charged today."}
                </p>
              </div>
            ) : (
              <p className="mt-5 text-sm leading-relaxed text-gray-500">
                Nothing is charged today. Your card stays as it is, and the new
                amount appears on your next invoice
                {nextRenewal ? ` on ${fmtDate(nextRenewal)}` : ""} — you can
                change tier at any renewal.
              </p>
            )}
            {changeError && (
              <p className="mt-3 text-sm text-red-600">{changeError}</p>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowUpgrade(false);
                  setChanged(null);
                  setChangeError("");
                }}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50"
              >
                {changed !== null ? "Done" : "Not now"}
              </button>
              {changed === null && (
                <button
                  onClick={confirmChange}
                  disabled={changing || !suggestedPackage}
                  className="rounded-lg px-5 py-2 text-sm font-medium text-white transition disabled:opacity-40"
                  style={{ backgroundColor: brand.accent }}
                >
                  {changing ? "Updating…" : "Confirm change"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
