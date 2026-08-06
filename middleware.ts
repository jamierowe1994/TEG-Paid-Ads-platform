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
/* The one public address. The app also answers on its raw Railway hostname —
 * Railway always serves it there — and that duplicate origin is a trap:
 * cookies are host-only, so a session or OAuth state cookie set on one host
 * is invisible on the other. Concretely: Azure redirects the browser back to
 * the REGISTERED (Railway) callback host, where the CSRF cookie set on the
 * branded host doesn't exist, so "Connect your email" silently bounced to
 * login. Same class of problem for old bookmarks and any PWA installed
 * against the wrong host.
 *
 * So: any request arriving on a legacy host is permanently redirected to the
 * same path on the canonical one. For the OAuth callback the query string
 * carries the code+state through the hop, and the token exchange still sends
 * the REGISTERED redirect_uri (that's a match-check parameter, not the host
 * the code is redeemed from) — which is why this works with no Azure change.
 *
 * EXCEPT /api/*: Stripe, Base44, Rex and Meta all POST webhooks here, they
 * were registered against whatever host was current at the time, and Stripe
 * for one does NOT follow redirects — a canonical bounce would silently drop
 * payments events. Server-to-server calls carry no cookies, so serving them
 * on either host is harmless. The single exception INSIDE /api is the
 * Microsoft OAuth callback, which is a browser navigation that needs the
 * branded-host cookies — the very case this exists for. */
const CANONICAL_HOST = "launchpad.theexpertsgroup.co.uk";
const LEGACY_HOSTS = new Set([
  "teg-paid-ads-platform-production.up.railway.app",
]);

function canonicalise(req: NextRequest): NextResponse | null {
  // Behind Railway's proxy the real public host rides in x-forwarded-host
  // (req.nextUrl.host is the internal container address).
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  if (!LEGACY_HOSTS.has(host)) return null;

  const path = req.nextUrl.pathname;
  const isBrowserCallback = path === "/api/auth/microsoft/callback";
  if (path.startsWith("/api/") && !isBrowserCallback) return null;

  const to = req.nextUrl.clone();
  to.protocol = "https:";
  to.host = CANONICAL_HOST;
  to.port = "";
  // 308: permanent, method-preserving — and lets browsers cache the hop so a
  // stale PWA pinned to the Railway host converges on the real one.
  return NextResponse.redirect(to, 308);
}

export function middleware(req: NextRequest) {
  const canonical = canonicalise(req);
  if (canonical) return canonical;

  // The homepage bounce only ever applied to "/" — keep it that way now the
  // matcher is wider.
  if (req.nextUrl.pathname !== "/") return NextResponse.next();
  if (req.nextUrl.searchParams.has("home")) return NextResponse.next();
  if (!req.cookies.get(SESSION_COOKIE)?.value) return NextResponse.next();

  const to = req.nextUrl.clone();
  to.pathname = "/dashboard";
  to.search = "";
  return NextResponse.redirect(to);
}

// Everything except Next's own assets — the canonical redirect has to see
// every page and the OAuth callback. Static chunks are content-addressed and
// host-agnostic, so redirecting them buys nothing.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
