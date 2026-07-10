import { NextRequest, NextResponse } from "next/server";
import { syncAllBrands, lastSyncRun } from "@/lib/lead-sync";

function authorised(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const password = process.env.ADMIN_PASSWORD ?? "experts-admin";
  return auth === `Bearer ${password}`;
}

// The automatic lead sync, on demand. GET = when it last ran and what it did;
// POST = run it right now (same code the 5-minute background loop calls).
export async function GET(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  return NextResponse.json({ lastRun: lastSyncRun() });
}

export async function POST(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const run = await syncAllBrands();
  return NextResponse.json({ ok: true, run });
}
