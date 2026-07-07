"use client";

import { useEffect, useState } from "react";
import { getUser, updateProfile } from "@/lib/session";
import { brandById, type Brand } from "@/lib/brands";
import { packageById } from "@/lib/packages";
import type { UserProfile } from "@/lib/types";

export default function ProfilePage() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => {
    const u = getUser();
    if (!u) return;
    setUser(u);
    setBrand(brandById(u.brandId) ?? null);
    setName(u.name);
    setMobile(u.mobile);
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

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-3xl font-semibold tracking-tight">Profile</h1>

      <section className="mt-8 rounded-2xl border border-gray-200 p-6">
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

      <section className="mt-6 rounded-2xl border border-gray-200 p-6">
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
