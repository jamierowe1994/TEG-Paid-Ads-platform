import { NextRequest, NextResponse } from "next/server";
import { rexDescribeModel } from "@/lib/rex";

function authorised(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const password = process.env.ADMIN_PASSWORD ?? "experts-admin";
  return auth === `Bearer ${password}`;
}

// Asks Rex what fields a model actually accepts — ground truth to fix the
// create-contact/create-lead field mapping against, instead of guessing.
// Body: { model?: string, brandId? } — defaults to Contacts / property.
export async function POST(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const model = String(body?.model ?? "Contacts");
  const brandId = String(body?.brandId ?? "property");

  try {
    const result = await rexDescribeModel(model, brandId);
    return NextResponse.json({ ok: true, model, result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, model, error: e instanceof Error ? e.message : "Rex request failed" },
      { status: 502 }
    );
  }
}
