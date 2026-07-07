import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { DATA_DIR } from "./data-dir";
import type { UserProfile } from "./types";

// Server-side user store. Backed by a JSON file for the framework stage so
// sign-in works properly across devices and sessions.
//
// IMPORTANT: Railway's filesystem is ephemeral — this file resets on each
// deploy, so accounts created here don't survive a redeploy. Before real
// launch, swap this module for a database (Postgres/Prisma) or move auth to
// Clerk. The function signatures below are what the rest of the app depends
// on, so a swap is contained to this file.

const FILE = path.join(DATA_DIR, "users.json");

// Stored record = public profile + the password hash (never sent to client).
export interface StoredUser extends UserProfile {
  passwordHash: string;
}

async function readAll(): Promise<StoredUser[]> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8")) as StoredUser[];
  } catch {
    return [];
  }
}

async function writeAll(users: StoredUser[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(users, null, 2), "utf8");
}

// Strip the password hash before anything leaves the server.
export function toPublic(user: StoredUser): UserProfile {
  const { passwordHash: _omit, ...pub } = user;
  return pub;
}

export async function findByEmail(
  email: string
): Promise<StoredUser | undefined> {
  const all = await readAll();
  return all.find((u) => u.email === email.toLowerCase());
}

export async function findById(id: string): Promise<StoredUser | undefined> {
  const all = await readAll();
  return all.find((u) => u.id === id);
}

export async function createUser(user: StoredUser): Promise<void> {
  const all = await readAll();
  all.push(user);
  await writeAll(all);
}

export async function updateUser(
  id: string,
  patch: Partial<StoredUser>
): Promise<StoredUser | undefined> {
  const all = await readAll();
  const idx = all.findIndex((u) => u.id === id);
  if (idx === -1) return undefined;
  all[idx] = { ...all[idx], ...patch, id: all[idx].id };
  await writeAll(all);
  return all[idx];
}

// Admin listing — public profiles only.
export async function listUsers(): Promise<UserProfile[]> {
  return (await readAll()).map(toPublic);
}
