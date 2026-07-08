import { NextRequest, NextResponse } from "next/server";
import { atlasPing } from "@/lib/atlas";

function authorised(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const password = process.env.ADMIN_PASSWORD ?? "experts-admin";
  return auth === `Bearer ${password}`;
}

// GET: Atlas connection status for the admin Connections tab.
export async function GET(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  return NextResponse.json(await atlasPing());
}
