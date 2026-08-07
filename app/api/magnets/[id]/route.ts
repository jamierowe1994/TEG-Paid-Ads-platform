import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth";
import { adminScope } from "@/lib/admin-auth";
import { findById } from "@/lib/users-store";
import { getMagnet } from "@/lib/lead-magnets";

export const dynamic = "force-dynamic";

// Download one magnet. Signed-in agents get their OWN brand's files (the
// download is the point of the whole feature); admin tiers per their scope.
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const found = await getMagnet(id);
  if (!found) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let allowed = false;
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (userId) {
    const user = await findById(userId);
    if (user && user.brandId === found.meta.brandId) allowed = true;
  }
  if (!allowed) {
    const scope = adminScope(req);
    if (scope?.role === "super") allowed = true;
    else if (scope && scope.brandId === found.meta.brandId) allowed = true;
  }
  if (!allowed) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  return new NextResponse(new Uint8Array(found.bytes), {
    headers: {
      "Content-Type": found.meta.mime,
      "Content-Disposition": `attachment; filename="${found.meta.filename.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
