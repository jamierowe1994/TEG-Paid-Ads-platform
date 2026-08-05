// The Rex embed entry point — the URL Rex loads in its iframe.
//
// Configure in Rex (Settings → Embedded Apps) as:
//   https://launchpad.theexpertsgroup.co.uk/api/rex/enter?token={{token}}&user_id={{user_id}}&account_id={{account_id}}
//
// What happens: the Rex token is exchanged server-side for the user's identity,
// matched to a Launch Pad account by email, and swapped for our own session
// cookie. Then we REDIRECT — which is what gets the token out of the address
// bar, so it doesn't linger in history, referrers or logs.
//
// The token never reaches the browser and is never written down.
//
// WHY THIS IS SAFE TO DO ON A GET: it's an SSO landing, so it has to be. The
// protection isn't the method, it's that the only thing which grants a session
// is a token Rex itself vouches for — a forged one gets a 401 and nothing
// happens. `user_id` and `account_id` in the URL are NOT trusted; they're
// carried for diagnostics only.
//
// MATCH ONLY, NEVER CREATE: if the Rex email has no Launch Pad account we say
// so. Provisioning an account from an iframe parameter would mean Rex users we
// know nothing about silently getting accounts.

import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, SESSION_COOKIE } from "@/lib/auth";
import { findByEmail } from "@/lib/users-store";
import {
  identifyRexToken,
  embedCookieOptions,
  rexEmbedEnabled,
} from "@/lib/rex-embed";

export const dynamic = "force-dynamic";

// Shorter than a normal session on purpose. These cookies are SameSite=None,
// so they travel more freely than the rest — a working day, not a month.
const EMBED_SESSION_SECONDS = 12 * 60 * 60;

/* The PUBLIC origin this request arrived on.
 *
 * NOT req.nextUrl.origin — behind Railway's proxy that is the container's own
 * address, so redirects came out as https://localhost:8080/... and the browser
 * had nowhere to go. The forwarded headers carry the real host.
 *
 * It has to be the request's host rather than a configured one: the session
 * cookie must land on whatever domain Rex actually loaded in the iframe, and
 * bouncing them to a different domain would set it somewhere they aren't.
 *
 * Only ever used to build a FIXED PATH on this app, never a caller-supplied
 * destination, so a spoofed Host can't turn this into an open redirect. */
function originOf(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const host =
    req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    req.headers.get("host")?.trim();
  if (host) return `${proto || "https"}://${host}`;
  return req.nextUrl.origin;
}

function status(req: NextRequest, code: string) {
  return NextResponse.redirect(new URL(`/rex?status=${code}`, originOf(req)));
}

export async function GET(req: NextRequest) {
  if (!rexEmbedEnabled()) return status(req, "disabled");

  const token = req.nextUrl.searchParams.get("token") ?? "";
  if (!token) return status(req, "no-token");

  const result = await identifyRexToken(token);
  if (!result.ok) {
    // Distinguish "Rex says no" from "we couldn't ask Rex" — one is a
    // rejected user, the other is our outage, and they need different fixes.
    return status(
      req,
      result.reason === "unreachable"
        ? "rex-unreachable"
        : result.reason === "service_account"
          ? "service-account"
          : "rejected"
    );
  }

  const user = await findByEmail(result.identity.email);
  if (!user) return status(req, "no-account");
  if (user.deactivatedAt) return status(req, "deactivated");

  const res = NextResponse.redirect(new URL("/dashboard", originOf(req)));
  res.cookies.set(
    SESSION_COOKIE,
    createSessionToken(user.id),
    embedCookieOptions(EMBED_SESSION_SECONDS)
  );
  return res;
}
