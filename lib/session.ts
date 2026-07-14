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
}): Promise<{ user?: UserProfile; error?: string; code?: string }> {
  const res = await fetch("/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { error: data.error ?? "Something went wrong", code: data.code };
  }
  saveUser(data.user);
  return { user: data.user };
}

// Is this email already registered? Lets the signup wizard catch a returning
// user at the email step. Fails open (exists:false) on a network hiccup so a
// blip never blocks a genuine new signup — the backend still 409s at submit.
export async function checkEmail(
  email: string
): Promise<{ exists: boolean; allowed: boolean }> {
  try {
    const res = await fetch("/api/auth/check-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) return { exists: false, allowed: true };
    return (await res.json()) as { exists: boolean; allowed: boolean };
  } catch {
    return { exists: false, allowed: true };
  }
}

export async function logIn(
  email: string,
  password: string,
  remember = true
): Promise<{ user?: UserProfile; error?: string; code?: string }> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, remember }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { error: data.error ?? "Something went wrong", code: data.code };
  }
  saveUser(data.user);
  return { user: data.user };
}

export async function updateProfile(patch: {
  name?: string;
  mobile?: string;
  location?: string;
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

// Push a lead into the brand's CRM — Atlas for Recruitment, Rex for
// Property/Lettings/Fine & Country/Auction. Creates the person + attaches
// its note; the server marks the lead pushed.
export async function pushLeadToCrm(leadId: string): Promise<{
  ok: boolean;
  error?: string;
  alreadyExisted?: boolean; // Atlas
  noteAttached?: boolean; // Atlas
  contactId?: string; // Rex
  contactAlreadyExisted?: boolean; // Rex
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

// The agent says this person was deleted inside Rex — verify with Rex and,
// if they're genuinely gone, reset the file to its pre-push state.
export async function resetRexLead(leadId: string): Promise<{
  ok: boolean;
  stillInRex?: boolean;
  lead?: Lead;
  error?: string;
}> {
  try {
    const res = await fetch("/api/leads/rex-reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error ?? "Reset failed" };
    return data as { ok: boolean; stillInRex?: boolean; lead?: Lead };
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

// Archive / unarchive a batch of leads. Returns the full refreshed list.
export async function archiveLeads(
  leadIds: string[],
  archived: boolean
): Promise<Lead[] | null> {
  try {
    const res = await fetch("/api/leads/archive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadIds, archived }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data.leads) ? (data.leads as Lead[]) : null;
  } catch {
    return null;
  }
}

// "Save for a later date" — archives the lead until the given date, when it
// resurfaces as new.
export async function snoozeLeadUntil(
  leadId: string,
  until: string,
  reason: string
): Promise<{ ok: boolean; lead?: Lead; error?: string }> {
  try {
    const res = await fetch("/api/leads/snooze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId, until, reason }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error ?? "Couldn't save" };
    return { ok: true, lead: data.lead as Lead };
  } catch {
    return { ok: false, error: "Network error — please try again" };
  }
}

// Send a real email to a lead from the agent's connected Microsoft mailbox.
export async function sendLeadEmail(
  leadId: string,
  subject: string,
  body: string
): Promise<{ ok: boolean; lead?: Lead; error?: string }> {
  try {
    const res = await fetch("/api/leads/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId, subject, body }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error ?? "Send failed" };
    return { ok: true, lead: data.lead as Lead };
  } catch {
    return { ok: false, error: "Network error — please try again" };
  }
}

// Request (or resume) cancellation of the subscription.
export async function cancelSubscription(
  cancel: boolean
): Promise<UserProfile | null> {
  try {
    const res = await fetch("/api/auth/cancel-subscription", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cancel }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.user) saveUser(data.user as UserProfile);
    return (data.user as UserProfile) ?? null;
  } catch {
    return null;
  }
}

// Set (or clear, with at = null) when a lead is next due back in Follow-ups.
export async function setLeadFollowUp(
  leadId: string,
  at: string | null
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/leads/follow-up", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId, at }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error ?? "Couldn't set the follow-up" };
    return { ok: true };
  } catch {
    return { ok: false, error: "Network error — please try again" };
  }
}

// Change your own password — must supply the current one to prove it's you.
export async function changePassword(
  current: string,
  next: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current, next }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error ?? "Couldn't change password" };
    return { ok: true };
  } catch {
    return { ok: false, error: "Network error — please try again" };
  }
}

// Permanently delete the account — confirm must match the account email.
export async function deleteAccount(
  confirm: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/auth/delete-account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error ?? "Couldn't delete" };
    try {
      window.localStorage.removeItem(USER_KEY);
    } catch {
      /* ignore */
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Network error — please try again" };
  }
}

// Drop the agent's Microsoft mailbox connection.
export async function disconnectMicrosoft(): Promise<UserProfile | null> {
  try {
    const res = await fetch("/api/auth/microsoft/disconnect", { method: "POST" });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.user) saveUser(data.user as UserProfile);
    return (data.user as UserProfile) ?? null;
  } catch {
    return null;
  }
}

// Duplicate-check every unchecked lead against the brand's CRM. Returns the
// refreshed list plus how many checks ran / matched.
export async function crmCheckAllLeads(): Promise<{
  ok: boolean;
  checked?: number;
  found?: number;
  unavailable?: boolean;
  leads?: Lead[];
  error?: string;
}> {
  try {
    const res = await fetch("/api/leads/crm-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error ?? "Check failed" };
    return { ok: true, ...data };
  } catch {
    return { ok: false, error: "Network error — please try again" };
  }
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

// Agents you could refer to at a brand (name/photo/area/tenure) — for the
// referral directory. Empty when a brand has no agents in the system yet.
export interface ReferralAgent {
  id: string;
  name: string;
  photo: string | null;
  location: string;
  since: string;
}

export async function fetchReferralAgents(
  brandId: string
): Promise<ReferralAgent[]> {
  try {
    const res = await fetch(
      `/api/referrals/agents?brand=${encodeURIComponent(brandId)}`,
      { cache: "no-store" }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.agents) ? (data.agents as ReferralAgent[]) : [];
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
  stage?: string;
}> {
  try {
    const res = await fetch("/api/notifications", { cache: "no-store" });
    if (!res.ok) return { newLeads: 0, pendingReferrals: 0 };
    return await res.json();
  } catch {
    return { newLeads: 0, pendingReferrals: 0 };
  }
}

// Customer campaign sign-off + feedback (Phase 2 approval loop).
export async function approveCampaign(): Promise<UserProfile | null> {
  try {
    const res = await fetch("/api/campaign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve" }),
    });
    if (!res.ok) return null;
    const { user } = await res.json();
    if (user) saveUser(user);
    return user ?? null;
  } catch {
    return null;
  }
}

export async function sendCampaignFeedback(
  text: string
): Promise<UserProfile | null> {
  try {
    const res = await fetch("/api/campaign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "feedback", text }),
    });
    if (!res.ok) return null;
    const { user } = await res.json();
    if (user) saveUser(user);
    return user ?? null;
  } catch {
    return null;
  }
}
