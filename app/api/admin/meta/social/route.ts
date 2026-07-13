import { NextRequest, NextResponse } from "next/server";
import { getAllSocials, getSocialSnapshot, sanitizePreset } from "@/lib/meta";

function authorised(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const password = process.env.ADMIN_PASSWORD ?? "experts-admin";
  return auth === `Bearer ${password}`;
}

// Organic socials snapshot — Facebook Page + linked Instagram followers, plus
// followers gained over the chosen window. GET ?brand=<id>&preset=<...> for one
// brand, or no brand for every Page-configured brand.
export async function GET(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const brandId = req.nextUrl.searchParams.get("brand");
  const preset = sanitizePreset(req.nextUrl.searchParams.get("preset"));
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
