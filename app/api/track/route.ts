import { NextRequest, NextResponse } from "next/server";
import {
  recordSignupStart,
  listSignupStarts,
} from "@/lib/events-store";

// Lightweight signup-funnel tracking. The signup wizard pings this as soon
// as someone passes the email step, so the admin CRM can show who started
// but never finished. Stored in Postgres on Railway (JSON file locally).

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  await recordSignupStart({
    email,
    name: String(body?.name ?? "").slice(0, 200),
    brandId: body?.brandId ? String(body.brandId) : null,
    startedAt: new Date().toISOString(),
  });
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
  return NextResponse.json(await listSignupStarts());
}
