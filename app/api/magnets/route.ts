import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth";
import { findById } from "@/lib/users-store";
import { listMagnets, matchMagnet } from "@/lib/lead-magnets";

export const dynamic = "force-dynamic";

// Agent-facing: the signed-in agent's own brand's magnets (metadata only),
// and optionally the best match for an ad name — so the lead file can say
// "this is the guide they asked for" without the agent hunting.
// GET /api/magnets            -> { magnets }
// GET /api/magnets?match=<ad> -> { magnets, match }
export async function GET(req: NextRequest) {
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!userId) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const user = await findById(userId);
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const magnets = await listMagnets(user.brandId);
  const matchText = req.nextUrl.searchParams.get("match");
  const match = matchText ? matchMagnet(matchText, magnets) : null;
  return NextResponse.json({ magnets, match });
}
