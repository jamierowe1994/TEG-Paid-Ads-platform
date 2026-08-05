import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

/* Send a signed-in agent from the marketing homepage to their dashboard.
 *
 * WHY THIS EXISTS: the "See lead" button in the WhatsApp alert points at a URL
 * baked into an APPROVED Meta template. Changing it means resubmitting the
 * template for approval, which takes days we haven't got — so the address is
 * fixed and the only thing we can change is what happens when someone lands
 * there. An agent who taps a lead notification wants their leads, not the
 * marketing site.
 *
 * Presence of the session cookie is enough — this deliberately does NOT verify
 * the token. Verification needs Node crypto, which doesn't run in middleware,
 * and it isn't needed: /dashboard does its own check and bounces anyone whose
 * session is stale or forged. The worst a bad cookie earns is a redirect to a
 * page that then sends them to sign in.
 *
 * ESCAPE HATCH: /?home=1 stays on the marketing page, so the site is still
 * reachable while signed in.
 */
export function middleware(req: NextRequest) {
  if (req.nextUrl.searchParams.has("home")) return NextResponse.next();
  if (!req.cookies.get(SESSION_COOKIE)?.value) return NextResponse.next();

  const to = req.nextUrl.clone();
  to.pathname = "/dashboard";
  to.search = "";
  return NextResponse.redirect(to);
}

// Only the homepage. Everything else is untouched.
export const config = { matcher: "/" };
