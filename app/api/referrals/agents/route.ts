import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth";
import { findById, listUsers } from "@/lib/users-store";

// The agents you could refer a lead to at a given brand — the beginnings of
// the group-wide business/coverage directory. Returns ONLY safe public fields
// (no email/phone/notes), for a chosen ?brand=, excluding the viewer. When the
// real directory + availability data lands this endpoint is where it plugs in.
export async function GET(req: NextRequest) {
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const me = await findById(userId);
  if (!me) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const brandId = req.nextUrl.searchParams.get("brand");
  if (!brandId) {
    return NextResponse.json({ error: "brand is required" }, { status: 400 });
  }

  const all = await listUsers();
  const agents = all
    .filter((u) => u.brandId === brandId && u.id !== userId)
    .map((u) => ({
      id: u.id,
      name: u.name,
      photo: u.photo ?? null,
      location: u.location ?? "",
      since: u.createdAt,
    }));

  return NextResponse.json({ agents });
}
