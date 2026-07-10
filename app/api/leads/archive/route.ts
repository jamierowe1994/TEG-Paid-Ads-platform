import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth";
import { setLeadsArchived, listLeadsForUser } from "@/lib/leads-store";

// Archive / unarchive a batch of the signed-in agent's leads.
// Body: { leadIds: string[], archived: boolean }
export async function POST(req: NextRequest) {
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const leadIds = Array.isArray(body?.leadIds)
    ? (body.leadIds as unknown[]).map(String).filter(Boolean)
    : [];
  const archived = !!body?.archived;
  if (leadIds.length === 0) {
    return NextResponse.json({ error: "leadIds required" }, { status: 400 });
  }
  const changed = await setLeadsArchived(userId, leadIds, archived);
  return NextResponse.json({
    ok: true,
    changed,
    leads: await listLeadsForUser(userId),
  });
}
