import { NextRequest, NextResponse } from "next/server";
import { ghlPing } from "@/lib/ghl";

function authorised(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const password = process.env.ADMIN_PASSWORD ?? "experts-admin";
  return auth === `Bearer ${password}`;
}

// GET: GoHighLevel connection status for the admin Connections tab. Pass
// ?brand=<id> to check that brand's own sub-account (falls back to the shared
// group credentials otherwise).
export async function GET(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const brandId = req.nextUrl.searchParams.get("brand") ?? undefined;
  return NextResponse.json(await ghlPing(brandId));
}
