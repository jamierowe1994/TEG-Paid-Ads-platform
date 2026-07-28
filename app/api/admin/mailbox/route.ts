import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { isSuperAdmin } from "@/lib/admin-auth";
import {
  systemMailboxStatus,
  clearSystemMailbox,
} from "@/lib/system-mailbox";
import { msConfigured, msAuthUrl } from "@/lib/microsoft";

/* The system mailbox (leads@theexpertsgroup.co.uk) — connect, check, remove.
 * Super admin only: this mailbox sends on behalf of the whole platform, so an
 * MD must not be able to repoint it.
 *
 *   GET             → status (never returns the refresh token)
 *   POST {action:"start"}      → { url } to send the browser to
 *   POST {action:"disconnect"} → forget the mailbox
 *
 * Start is a POST rather than a redirect because admin auth is a bearer token
 * held by the admin UI, and a browser redirect can't carry a header. So the
 * UI asks for the URL with its bearer, we set a short-lived httpOnly nonce
 * cookie, and the UI does the navigation itself.
 */

export async function GET(req: NextRequest) {
  if (!isSuperAdmin(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  return NextResponse.json({
    ...(await systemMailboxStatus()),
    microsoftConfigured: msConfigured(),
  });
}

export async function POST(req: NextRequest) {
  if (!isSuperAdmin(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? "");

  if (action === "disconnect") {
    await clearSystemMailbox();
    return NextResponse.json({ ok: true, connected: false });
  }

  if (action !== "start") {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  if (!msConfigured()) {
    return NextResponse.json(
      {
        error:
          "Microsoft isn't configured — AZURE_CLIENT_ID / AZURE_CLIENT_SECRET are unset.",
      },
      { status: 503 }
    );
  }

  const nonce = crypto.randomBytes(16).toString("hex");
  const res = NextResponse.json({ url: msAuthUrl(nonce) });
  // The shared Microsoft callback branches on this cookie: present and
  // matching means "this consent is for the system mailbox", absent means the
  // ordinary per-agent flow. Reusing that callback avoids registering a
  // second redirect URI in Azure.
  res.cookies.set("teg_admin_mb_state", nonce, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return res;
}
