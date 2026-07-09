import { NextRequest, NextResponse } from "next/server";
import { pushLeadToRex, rexAccountForBrand } from "@/lib/rex";
import type { Lead } from "@/lib/types";

function authorised(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const password = process.env.ADMIN_PASSWORD ?? "experts-admin";
  return auth === `Bearer ${password}`;
}

// One-off probe: pushes a synthetic test lead through the real Rex pipeline
// (login -> find/create contact -> create lead) so we can confirm the
// connection + field mapping work before wiring the real "Push to REX"
// button. Never touches portal lead data — the lead is made up here.
// Body: { brandId? } — defaults to "property".
export async function POST(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const brandId = String(body?.brandId ?? "property");
  const accountId = rexAccountForBrand(brandId);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const testLead: Lead = {
    id: `probe-${stamp}`,
    name: "Portal Test Lead",
    phone: "07700900123",
    email: `portal-test-${Date.now()}@example.com`,
    source: "facebook",
    note: `Connection test from the Experts portal at ${new Date().toLocaleString(
      "en-GB"
    )} — safe to delete.`,
    stage: "converted",
    receivedAt: new Date().toISOString(),
    history: [],
  };

  try {
    const result = await pushLeadToRex(testLead, brandId);
    return NextResponse.json({ ok: true, brandId, accountId, result });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        brandId,
        accountId,
        error: e instanceof Error ? e.message : "Rex push failed",
      },
      { status: 502 }
    );
  }
}
