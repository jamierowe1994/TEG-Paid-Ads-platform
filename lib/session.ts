"use client";

// Client session layer. Auth is now real: the source of truth is an
// httpOnly session cookie validated by the server (see lib/auth.ts and the
// /api/auth routes). We keep a localStorage *cache* of the signed-in user so
// the dashboard pages can read it synchronously — but it's only ever
// populated from a server response, and every dashboard load re-validates via
// /api/auth/me.
//
// Leads live server-side (Postgres on Railway) via /api/leads. Referrals
// remain local demo data until cross-account delivery is built.

import type { UserProfile, Lead, Referral } from "./types";

const USER_KEY = "teg_user";

function read<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

// ── Auth ─────────────────────────────────────────────────────────────────
export function getUser(): UserProfile | null {
  return read<UserProfile>(USER_KEY);
}

export function saveUser(user: UserProfile) {
  write(USER_KEY, user);
}

// Re-validate the session against the server. Returns the fresh user (and
// refreshes the cache) or null if not signed in.
export async function refreshUser(): Promise<UserProfile | null> {
  try {
    const res = await fetch("/api/auth/me", { cache: "no-store" });
    if (!res.ok) {
      window.localStorage.removeItem(USER_KEY);
      return null;
    }
    const { user } = await res.json();
    if (user) saveUser(user);
    return user ?? null;
  } catch {
    return null;
  }
}

export async function signUp(payload: {
  name: string;
  email: string;
  password: string;
  mobile: string;
  photo: string | null;
  brandId: string;
  platforms: string[];
  goal: string;
  packageId: string;
}): Promise<{ user?: UserProfile; error?: string }> {
  const res = await fetch("/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { error: data.error ?? "Something went wrong" };
  saveUser(data.user);
  return { user: data.user };
}

export async function logIn(
  email: string,
  password: string,
  remember = true
): Promise<{ user?: UserProfile; error?: string }> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, remember }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { error: data.error ?? "Something went wrong" };
  saveUser(data.user);
  return { user: data.user };
}

export async function updateProfile(patch: {
  name?: string;
  mobile?: string;
  photo?: string | null;
}): Promise<UserProfile | null> {
  const res = await fetch("/api/auth/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) return null;
  const { user } = await res.json();
  if (user) saveUser(user);
  return user ?? null;
}

export async function signOut() {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch {
    /* ignore network errors on sign-out */
  }
  window.localStorage.removeItem(USER_KEY);
}

// ── Leads (server-side, Postgres on Railway) ─────────────────────────────
export async function fetchLeads(): Promise<Lead[]> {
  try {
    const res = await fetch("/api/leads", { cache: "no-store" });
    if (!res.ok) return [];
    return (await res.json()) as Lead[];
  } catch {
    return [];
  }
}

export async function moveLeadStage(
  leadId: string,
  stage: Lead["stage"]
): Promise<Lead | null> {
  try {
    const res = await fetch("/api/leads", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId, stage }),
    });
    if (!res.ok) return null;
    return (await res.json()) as Lead;
  } catch {
    return null;
  }
}

// Push a lead into the brand's CRM (Atlas for The Recruitment Experts).
// Creates the person + attaches its note; the server marks the lead pushed.
export async function pushLeadToCrm(leadId: string): Promise<{
  ok: boolean;
  error?: string;
  alreadyExisted?: boolean;
  noteAttached?: boolean;
}> {
  try {
    const res = await fetch("/api/leads/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error ?? "Push failed" };
    return { ok: true, ...data };
  } catch {
    return { ok: false, error: "Network error — please try again" };
  }
}

// Per-lead modal actions (note / book / cancel booking). Each returns the
// updated lead, or null on failure.
async function leadAction(body: Record<string, unknown>): Promise<Lead | null> {
  try {
    const res = await fetch("/api/leads/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return (await res.json()) as Lead;
  } catch {
    return null;
  }
}

export function addLeadNote(leadId: string, text: string) {
  return leadAction({ leadId, action: "note", text });
}
export function bookLeadAppointment(leadId: string, at: string) {
  return leadAction({ leadId, action: "book", at });
}
export function cancelLeadAppointment(leadId: string) {
  return leadAction({ leadId, action: "cancelBooking" });
}

// ── Referrals (server-side, Postgres on Railway) ─────────────────────────
export async function fetchReferrals(): Promise<Referral[]> {
  try {
    const res = await fetch("/api/referrals", { cache: "no-store" });
    if (!res.ok) return [];
    return (await res.json()) as Referral[];
  } catch {
    return [];
  }
}

export async function sendReferral(payload: {
  toBrandId: string;
  leadName: string;
  leadPhone: string;
  leadEmail: string;
  note: string;
  feeAmount: number;
  dueDate: string | null;
}): Promise<{ referral?: Referral; error?: string }> {
  const res = await fetch("/api/referrals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { error: data.error ?? "Something went wrong" };
  return { referral: data };
}

export async function actOnReferral(
  id: string,
  action: "accept" | "decline" | "markPaid" | "note",
  text?: string
): Promise<Referral | null> {
  const res = await fetch("/api/referrals", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, action, text }),
  });
  if (!res.ok) return null;
  return (await res.json()) as Referral;
}

export async function fetchNotifications(): Promise<{
  newLeads: number;
  pendingReferrals: number;
}> {
  try {
    const res = await fetch("/api/notifications", { cache: "no-store" });
    if (!res.ok) return { newLeads: 0, pendingReferrals: 0 };
    return await res.json();
  } catch {
    return { newLeads: 0, pendingReferrals: 0 };
  }
}
