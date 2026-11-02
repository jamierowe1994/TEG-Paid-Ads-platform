import { NextRequest, NextResponse } from "next/server";
import {
  configuredBrandIds,
  getSnapshotFor,
  metaTokenSet,
  sanitizePreset,
  explainMetaError,
  verifyLeadsPage,
} from "@/lib/meta";
import type { Snapshot } from "@/lib/meta";
import { getBrandMetaMap, setBrandMeta } from "@/lib/brand-meta-store";
import {
  getLeadSyncStatuses,
  clearLeadSyncStatus,
} from "@/lib/lead-sync-status";
import { syncAllBrands } from "@/lib/lead-sync";

// Each brand's persisted lead-sync result, with Meta's error put into plain
// English for the Connections tab.
async function leadSyncView() {
  try {
    const statuses = await getLeadSyncStatuses();
    const out: Record<string, unknown> = {};
    for (const [id, st] of Object.entries(statuses)) {
      out[id] = {
        ...st,
        explanation: st.error ? explainMetaError(st.error, st.errorCode) : null,
      };
    }
    return out;
  } catch {
    return null; // the tab says "couldn't load" rather than "all fine"
  }
}

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

  const preset = sanitizePreset(req.nextUrl.searchParams.get("preset"));
  const [ids, config, leadSync] = await Promise.all([
    configuredBrandIds(),
    getBrandMetaMap(),
    leadSyncView(),
  ]);
  const results: Array<{ brandId: string; snapshot?: Snapshot; error?: string }> =
    await Promise.all(
      ids.map(async (brandId) => {
        try {
          const snapshot = await getSnapshotFor(brandId, preset);
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
    leadSync,
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
  const pageId = body?.pageId ? String(body.pageId).trim() || null : null;
  const previousPage = (await getBrandMetaMap())[brandId]?.pageId ?? null;
  const pageChanged = pageId !== previousPage;

  // A new Page ID must be a real Page that Launch Pad can read leads from.
  // TME once had its business id saved here, and TPE a Page the system user
  // couldn't open: both "saved" fine and then never synced a lead.
  let pageName: string | null = null;
  if (pageId && pageChanged && metaTokenSet()) {
    const check = await verifyLeadsPage(pageId);
    if (!check.ok) {
      return NextResponse.json(
        { ok: false, field: "pageId", error: check.error },
        { status: 400 }
      );
    }
    pageName = check.name;
  }

  await setBrandMeta(
    brandId,
    body?.adAccountId ? String(body.adAccountId) : null,
    pageId
  );

  // The old result was about the old Page. Start fresh and sync now, so the
  // tab shows the new Page's real state in seconds rather than five minutes.
  if (pageChanged) {
    await clearLeadSyncStatus([brandId]).catch(() => {});
    if (pageId) syncAllBrands().catch(() => {});
  }
  // Return that brand's fresh status so the UI can update immediately.
  try {
    const snapshot = await getSnapshotFor(brandId, "last_30d");
    return NextResponse.json({ ok: true, brandId, pageName, snapshot });
  } catch (e) {
    return NextResponse.json({
      ok: true,
      brandId,
      pageName,
      error: e instanceof Error ? e.message : "Meta request failed",
    });
  }
}
