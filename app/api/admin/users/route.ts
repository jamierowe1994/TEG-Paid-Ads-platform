import { NextRequest, NextResponse } from "next/server";
import { listUsers } from "@/lib/users-store";

// Admin-only: list every signed-up agent (public profiles, no password
// hashes). Gated by the admin password sent as a bearer token — replace with
// real admin auth later. This is what lets the admin see all signups in one
// place now that accounts are stored server-side.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const password = process.env.ADMIN_PASSWORD ?? "experts-admin";
  if (auth !== `Bearer ${password}`) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  return NextResponse.json(await listUsers());
}
