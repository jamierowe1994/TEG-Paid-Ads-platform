import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import {
  linkedinStatus,
  linkedinAuthorizeUrl,
  linkedinConfiguredBrandIds,
  getLinkedInSnapshot,
  linkedinConfigured,
  type LinkedInSnapshot,
} from "@/lib/linkedin";
import { getBrandMetaMap, setBrandLinkedIn } from "@/lib/brand-meta-store";

function authorised(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const password = process.env.ADMIN_PASSWORD ?? "experts-admin";
  return auth === `Bearer ${password}`;
}

// GET: connection status + per-brand LinkedIn stats + config for prefill.
export async function GET(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const [status, ids, map] = await Promise.all([
    linkedinStatus(),
    linkedinConfiguredBrandIds(),
    getBrandMetaMap(),
  ]);
  const results: Array<{
    brandId: string;
    snapshot?: LinkedInSnapshot;
    error?: string;
  }> = await Promise.all(
    ids.map(async (brandId) => {
      try {
        const snapshot = await getLinkedInSnapshot(brandId);
        return snapshot ? { brandId, snapshot } : { brandId, error: "No data" };
      } catch (e) {
        return {
          brandId,
          error: e instanceof Error ? e.message : "LinkedIn request failed",
        };
      }
    })
  );
  const config: Record<string, string | null> = {};
  for (const b of Object.keys(map)) config[b] = map[b].linkedinAdAccount;
  return NextResponse.json({ ...status, results, config });
}

// POST: start the OAuth connect — returns the authorize URL and sets a state
// cookie the callback checks. Body: { action: "connectUrl" }.
export async function POST(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  if (!linkedinConfigured()) {
    return NextResponse.json(
      { error: "Set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET first." },
      { status: 400 }
    );
  }
  const state = crypto.randomBytes(16).toString("hex");
  const res = NextResponse.json({ url: linkedinAuthorizeUrl(state) });
  res.cookies.set("li_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return res;
}

// PATCH: set/clear a brand's LinkedIn ad account. Body: { brandId, adAccount }.
export async function PATCH(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const brandId = String(body?.brandId ?? "");
  if (!brandId) {
    return NextResponse.json({ error: "brandId required" }, { status: 400 });
  }
  await setBrandLinkedIn(brandId, body?.adAccount ? String(body.adAccount) : null);
  try {
    const snapshot = await getLinkedInSnapshot(brandId);
    return NextResponse.json({ ok: true, brandId, snapshot });
  } catch (e) {
    return NextResponse.json({
      ok: true,
      brandId,
      error: e instanceof Error ? e.message : "LinkedIn request failed",
    });
  }
}
