"use client";

// Demo session layer. The signed-up user lives in localStorage so the whole
// journey works end-to-end without a backend. When Stripe + a real database
// land, this file is the only thing that needs swapping (e.g. for NextAuth
// or a session cookie) — everything else reads through these helpers.

import type { UserProfile, Lead, Referral } from "./types";
import { seedLeads, seedReferrals } from "./mock";

const USER_KEY = "teg_user";
const LEADS_KEY = "teg_leads";
const REFERRALS_KEY = "teg_referrals";

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

export function getUser(): UserProfile | null {
  return read<UserProfile>(USER_KEY);
}

export function saveUser(user: UserProfile) {
  write(USER_KEY, user);
}

export function signOut() {
  window.localStorage.removeItem(USER_KEY);
}

// Leads and referrals are seeded with demo data on first visit so the
// dashboard has something to show. Replace with API calls once the lead
// channel is confirmed.
export function getLeads(): Lead[] {
  const existing = read<Lead[]>(LEADS_KEY);
  if (existing) return existing;
  write(LEADS_KEY, seedLeads);
  return seedLeads;
}

export function saveLeads(leads: Lead[]) {
  write(LEADS_KEY, leads);
}

export function getReferrals(): Referral[] {
  const existing = read<Referral[]>(REFERRALS_KEY);
  if (existing) return existing;
  write(REFERRALS_KEY, seedReferrals);
  return seedReferrals;
}

export function saveReferrals(referrals: Referral[]) {
  write(REFERRALS_KEY, referrals);
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}
