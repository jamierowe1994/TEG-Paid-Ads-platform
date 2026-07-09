import { NextRequest, NextResponse } from "next/server";
import { listRecentRexWebhooks } from "@/lib/rex-webhook-log";

function authorised(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const password = process.env.ADMIN_PASSWORD ?? "experts-admin";
  return auth === `Bearer ${password}`;
}

// Recent raw Rex webhook deliveries — lets us read the real event shape from
// the admin panel instead of digging through Railway logs.
export async function GET(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  return NextResponse.json({ events: await listRecentRexWebhooks(10) });
}
