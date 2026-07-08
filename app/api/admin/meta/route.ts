import { NextRequest, NextResponse } from "next/server";
import { configuredBrandIds, getSnapshotFor, metaTokenSet } from "@/lib/meta";
import type { Snapshot } from "@/lib/meta";
import { getBrandMetaMap, setBrandMeta } from "@/lib/brand-meta-store";

function authorised(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const password = process.env.ADMIN_PASSWORD ?? "experts-admin";
  return auth === `Bearer ${password}`;
}

// Admin-only: live Meta stats for every configured brand, plus the current
// per-brand config so the admin inputs can prefill.
export async function GET(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const [ids, config] = await Promise.all([
    configuredBrandIds(),
    getBrandMetaMap(),
  ]);
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

  return NextResponse.json({
    tokenSet: metaTokenSet(),
    results,
    config,
  });
}

// Admin sets/clears a brand's ad account (+ optional page) — no redeploy.
// Body: { brandId, adAccountId, pageId? }
export async function PATCH(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const brandId = String(body?.brandId ?? "");
  if (!brandId) {
    return NextResponse.json({ error: "brandId required" }, { status: 400 });
  }
  await setBrandMeta(
    brandId,
    body?.adAccountId ? String(body.adAccountId) : null,
    body?.pageId ? String(body.pageId) : null
  );
  // Return that brand's fresh status so the UI can update immediately.
  try {
    const snapshot = await getSnapshotFor(brandId, "last_30d");
    return NextResponse.json({ ok: true, brandId, snapshot });
  } catch (e) {
    return NextResponse.json({
      ok: true,
      brandId,
      error: e instanceof Error ? e.message : "Meta request failed",
    });
  }
}
