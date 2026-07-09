import { NextRequest, NextResponse } from "next/server";
import { rexListUsers } from "@/lib/rex";

function authorised(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const password = process.env.ADMIN_PASSWORD ?? "experts-admin";
  return auth === `Bearer ${password}`;
}

// Lists the users on a brand's Rex account — how the admin finds each
// agent's Rex user id to paste into their profile, so pushed leads land
// owned by the right person. Body: { brandId? }.
export async function POST(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const brandId = String(body?.brandId ?? "property");

  try {
    const result = await rexListUsers(brandId);
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Rex request failed" },
      { status: 502 }
    );
  }
}
