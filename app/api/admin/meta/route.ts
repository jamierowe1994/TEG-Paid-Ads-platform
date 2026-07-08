import { NextRequest, NextResponse } from "next/server";
import { metaConfigured, getTreSnapshot } from "@/lib/meta";

// Admin-only: live Meta status + TRE's ad-account stats. Returns
// { configured: false } until the env vars are set; once they are, returns
// the live snapshot (or an error message if the token/account is rejected).
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const password = process.env.ADMIN_PASSWORD ?? "experts-admin";
  if (auth !== `Bearer ${password}`) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  if (!metaConfigured()) {
    return NextResponse.json({ configured: false });
  }
  try {
    const snapshot = await getTreSnapshot("last_30d");
    return NextResponse.json({ configured: true, snapshot });
  } catch (e) {
    return NextResponse.json({
      configured: true,
      error: e instanceof Error ? e.message : "Meta request failed",
    });
  }
}
