import { NextRequest, NextResponse } from "next/server";
import { adminScope } from "@/lib/admin-auth";
import { brandById } from "@/lib/brands";
import { adNamesForBrand } from "@/lib/leads-store";
import {
  listMagnets,
  allPins,
  pinMagnet,
  adKey,
  matchMagnet,
} from "@/lib/lead-magnets";

export const dynamic = "force-dynamic";

/* The connect-them-all worklist: every ad name the brand's leads carry, with
 * what it currently resolves to — a pin, a fuzzy match, or NOTHING. The
 * nothings are the point: "no lead without its guide" stops being a hope and
 * becomes an empty gap list (James, 7 Aug — Zill's "X Renters FB FAQ" ad
 * shares no words with its compliance guide, so fuzzy alone can never
 * connect it).
 *
 * GET  ?brand= (super only; scoped tiers get their own brand)
 * POST { adName, magnetId | null }  — pin / unpin
 */

function scopedBrand(req: NextRequest, scope: { role: string; brandId?: string }): string | null {
  if (scope.role !== "super") return scope.brandId ?? null;
  const b = req.nextUrl.searchParams.get("brand") ?? "";
  return brandById(b) ? b : null;
}

export async function GET(req: NextRequest) {
  const scope = adminScope(req);
  if (!scope) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const brand = scopedBrand(req, scope);
  if (!brand) return NextResponse.json({ error: "brand required" }, { status: 400 });

  const [ads, magnets, pins] = await Promise.all([
    adNamesForBrand(brand),
    listMagnets(brand),
    allPins(brand),
  ]);
  const rows = ads.map(({ adName, count }) => {
    const pinnedId = pins[adKey(adName)];
    const pinnedMagnet = pinnedId ? magnets.find((m) => m.id === pinnedId) : null;
    const auto = pinnedMagnet ? null : matchMagnet(adName, magnets);
    return {
      adName,
      count,
      magnetId: pinnedMagnet?.id ?? auto?.id ?? null,
      magnetTitle: pinnedMagnet?.title ?? auto?.title ?? null,
      pinned: !!pinnedMagnet,
    };
  });
  return NextResponse.json({
    rows,
    magnets: magnets.map((m) => ({ id: m.id, title: m.title })),
    unmatched: rows.filter((r) => !r.magnetId).length,
  });
}

export async function POST(req: NextRequest) {
  const scope = adminScope(req);
  if (!scope) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const adName = String(body?.adName ?? "").trim();
  const magnetId = body?.magnetId === null ? null : String(body?.magnetId ?? "");
  if (!adName) return NextResponse.json({ error: "adName required" }, { status: 400 });
  const brand =
    scope.role === "super"
      ? String(body?.brandId ?? "")
      : scope.brandId;
  if (!brand || !brandById(brand)) {
    return NextResponse.json({ error: "brand required" }, { status: 400 });
  }
  if (magnetId) {
    const own = await listMagnets(brand);
    if (!own.some((m) => m.id === magnetId)) {
      return NextResponse.json({ error: "That guide isn't in this brand's library." }, { status: 400 });
    }
  }
  await pinMagnet(brand, adName, magnetId || null);
  return NextResponse.json({ ok: true });
}
