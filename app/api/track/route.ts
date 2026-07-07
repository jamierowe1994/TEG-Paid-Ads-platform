import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { DATA_DIR } from "@/lib/data-dir";

// Lightweight signup-funnel tracking. The signup wizard pings this as soon
// as someone passes the email step, so the admin CRM can show who started
// but never finished. One record per email (latest wins).

const FILE = path.join(DATA_DIR, "signup-events.json");

export interface SignupEvent {
  email: string;
  name: string;
  brandId: string | null;
  startedAt: string;
}

async function readAll(): Promise<SignupEvent[]> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8")) as SignupEvent[];
  } catch {
    return [];
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const all = await readAll();
  const existing = all.findIndex((e) => e.email === email);
  const event: SignupEvent = {
    email,
    name: String(body?.name ?? "").slice(0, 200),
    brandId: body?.brandId ? String(body.brandId) : null,
    startedAt:
      existing >= 0 ? all[existing].startedAt : new Date().toISOString(),
  };
  if (existing >= 0) all[existing] = event;
  else all.push(event);
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(all, null, 2), "utf8");
  return NextResponse.json({ ok: true });
}

// Admin-only: list signup starts (the CRM tab diffs these against completed
// accounts to show drop-offs).
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const password = process.env.ADMIN_PASSWORD ?? "experts-admin";
  if (auth !== `Bearer ${password}`) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  return NextResponse.json(await readAll());
}
