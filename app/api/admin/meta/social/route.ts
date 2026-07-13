import { NextRequest, NextResponse } from "next/server";
import { getAllSocials, getSocialSnapshot, sanitizePreset } from "@/lib/meta";
import { adminScope } from "@/lib/admin-auth";

// Organic socials snapshot — Facebook Page + linked Instagram followers, plus
// followers gained over the chosen window. Both admin tiers can call it:
//   • super → any brand (?brand=<id>), or all Page-configured brands (no brand)
//   • md    → locked to their own brand (the ?brand param is ignored)
export async function GET(req: NextRequest) {
  const scope = adminScope(req);
  if (!scope) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const preset = sanitizePreset(req.nextUrl.searchParams.get("preset"));
  // An MD only ever sees their own brand, whatever the query says.
  const brandId =
    scope.role === "md" ? scope.brandId : req.nextUrl.searchParams.get("brand");
  try {
    if (brandId) {
      const social = await getSocialSnapshot(brandId, preset);
      return NextResponse.json({ brandId, preset, social });
    }
    const socials = await getAllSocials();
    return NextResponse.json({ preset, socials });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Meta request failed" },
      { status: 502 }
    );
  }
}
