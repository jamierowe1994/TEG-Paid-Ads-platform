import { NextRequest, NextResponse } from "next/server";
import {
  diagnoseAgentCampaigns,
  parseCampaignIds,
  metaTokenSet,
} from "@/lib/meta";

function authorised(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const password = process.env.ADMIN_PASSWORD ?? "experts-admin";
  return auth === `Bearer ${password}`;
}

// Full per-agent Meta pipeline diagnostics — every step's raw Meta answer,
// nothing swallowed. Body: { campaignIds: "id, id, …", brandId }
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
    return NextResponse.json(
      { error: "No campaign ids given." },
      { status: 400 }
    );
  }
  const brandId = String(body?.brandId ?? "");
  const report = await diagnoseAgentCampaigns(brandId, ids);
  return NextResponse.json({ ok: true, report });
}
