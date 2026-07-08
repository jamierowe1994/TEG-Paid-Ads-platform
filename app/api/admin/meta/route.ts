import { NextRequest, NextResponse } from "next/server";
import { configuredBrandIds, getSnapshotFor, metaTokenSet } from "@/lib/meta";
import type { Snapshot } from "@/lib/meta";

// Admin-only: live Meta stats for every configured brand. Returns
// { tokenSet, results: [{ brandId, snapshot } | { brandId, error }] }.
// results is empty until at least one brand's ad account env var is set.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const password = process.env.ADMIN_PASSWORD ?? "experts-admin";
  if (auth !== `Bearer ${password}`) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const ids = configuredBrandIds();
  const results: Array<{ brandId: string; snapshot?: Snapshot; error?: string }> =
    await Promise.all(
      ids.map(async (brandId) => {
        try {
          const snapshot = await getSnapshotFor(brandId, "last_30d");
          return snapshot ? { brandId, snapshot } : { brandId, error: "No data" };
        } catch (e) {
          return {
            brandId,
            error: e instanceof Error ? e.message : "Meta request failed",
          };
        }
      })
    );

  return NextResponse.json({ tokenSet: metaTokenSet(), results });
}
