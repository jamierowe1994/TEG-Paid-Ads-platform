import { NextRequest, NextResponse } from "next/server";
import { getSocialSnapshot, sanitizePreset } from "@/lib/meta";

// Partner API — organic socials (Facebook + Instagram followers + growth) for
// one brand, for a trusted sister app (the TLE portal). Gated by the shared
// PARTNER_API_KEY, server-to-server only.
//
//   GET /api/partner/social?brand=lettings&preset=last_30d
//   Authorization: Bearer <PARTNER_API_KEY>
//   → { brand, preset, social: { facebook{…}, instagram{…} } }

function authorised(req: NextRequest): boolean {
  const key = process.env.PARTNER_API_KEY;
  if (!key) return false;
  const header = req.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (bearer.length !== key.length) return false;
  let diff = 0;
  for (let i = 0; i < key.length; i++) diff |= bearer.charCodeAt(i) ^ key.charCodeAt(i);
  return diff === 0;
}

export async function GET(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const brand = (req.nextUrl.searchParams.get("brand") ?? "lettings").trim();
  const preset = sanitizePreset(req.nextUrl.searchParams.get("preset"));
  try {
    const social = await getSocialSnapshot(brand, preset);
    return NextResponse.json({ brand, preset, social });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Meta request failed" },
      { status: 502 }
    );
  }
}
