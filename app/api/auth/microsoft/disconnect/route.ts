import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth";
import { findById, setMsConnection, toPublic } from "@/lib/users-store";
import { msForgetUser } from "@/lib/microsoft";

// Disconnect the agent's Microsoft mailbox — drops our refresh token via a
// column-scoped write (a whole-record rewrite racing a token rotation could
// resurrect the connection). Their IT can also revoke the grant Azure-side.
export async function POST(req: NextRequest) {
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  msForgetUser(userId);
  await setMsConnection(userId, null);
  const user = await findById(userId);
  if (!user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, user: toPublic(user) });
}
