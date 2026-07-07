import { NextRequest, NextResponse } from "next/server";
import { summariseLeadsByUser } from "@/lib/leads-store";

// Admin-only: per-user lead totals + conversions, for the Performance tab's
// brand comparison. (The admin UI joins these to users client-side.)
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const password = process.env.ADMIN_PASSWORD ?? "experts-admin";
  if (auth !== `Bearer ${password}`) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  return NextResponse.json(await summariseLeadsByUser());
}
