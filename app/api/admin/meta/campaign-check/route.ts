import { NextRequest, NextResponse } from "next/server";
import { getCampaignsInfo, parseCampaignIds, metaTokenSet } from "@/lib/meta";

function authorised(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const password = process.env.ADMIN_PASSWORD ?? "experts-admin";
  return auth === `Bearer ${password}`;
}

// Verifies an agent's Meta campaign id(s) against Meta itself — returns each
// campaign's real name + status so the admin can see the link actually saved
// AND points at a real campaign, not just that text landed in a box. Pass
// `brandId` to also catch campaigns living in a DIFFERENT ad account than the
// brand pulls stats from (they verify fine by id but contribute nothing).
// Body: { campaignIds: "id, id, …", brandId? }
export async function POST(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  if (!metaTokenSet()) {
    return NextResponse.json(
      { error: "Meta isn't connected (META_SYSTEM_TOKEN missing)." },
      { status: 503 }
    );
  }
  const body = await req.json().catch(() => ({}));
  const ids = parseCampaignIds(String(body?.campaignIds ?? ""));
  if (ids.length === 0) {
    return NextResponse.json({ error: "No campaign ids given." }, { status: 400 });
  }
  const brandId = body?.brandId ? String(body.brandId) : undefined;
  const campaigns = await getCampaignsInfo(ids, brandId);
  return NextResponse.json({ ok: true, campaigns });
}
