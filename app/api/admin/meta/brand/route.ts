import { NextRequest, NextResponse } from "next/server";
import { getSnapshotFor, getBrandAdsFor, sanitizePreset } from "@/lib/meta";

function authorised(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const password = process.env.ADMIN_PASSWORD ?? "experts-admin";
  return auth === `Bearer ${password}`;
}

// Drill-down for one brand: its snapshot + per-ad performance for the chosen
// date range. GET ?brand=<id>&preset=<last_7d|last_14d|last_30d|last_90d>
export async function GET(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const brandId = req.nextUrl.searchParams.get("brand") ?? "";
  if (!brandId) {
    return NextResponse.json({ error: "brand required" }, { status: 400 });
  }
  const preset = sanitizePreset(req.nextUrl.searchParams.get("preset"));
  try {
    const [snapshot, ads] = await Promise.all([
      getSnapshotFor(brandId, preset),
      getBrandAdsFor(brandId, preset),
    ]);
    if (!snapshot) {
      return NextResponse.json(
        { error: "This brand isn't connected to Meta." },
        { status: 400 }
      );
    }
    return NextResponse.json({ brandId, preset, snapshot, ads: ads ?? [] });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Meta request failed" },
      { status: 502 }
    );
  }
}
