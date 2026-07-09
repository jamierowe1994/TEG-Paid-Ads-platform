import { NextRequest, NextResponse } from "next/server";
import { rexSearchContactsByName, rexRecentContacts } from "@/lib/rex";

function authorised(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const password = process.env.ADMIN_PASSWORD ?? "experts-admin";
  return auth === `Bearer ${password}`;
}

// Ground-truth lookups against Rex's own API — bypasses whatever the Rex web
// UI's search box does, so we can confirm whether a pushed contact actually
// exists and what it actually contains. Body: { name?, brandId? }. Omit
// `name` to list the most recently created contacts instead.
export async function POST(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const name = String(body?.name ?? "").trim();
  const brandId = String(body?.brandId ?? "property");

  try {
    const result = name
      ? await rexSearchContactsByName(name, brandId)
      : await rexRecentContacts(brandId);
    return NextResponse.json({ ok: true, name: name || null, result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Rex search failed" },
      { status: 502 }
    );
  }
}
