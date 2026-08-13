import "server-only";
import type { NextRequest } from "next/server";
import type { SeenSurface } from "./users-store";

/* Which surface is this request coming from?
 *
 * mobile/desktop comes from the user-agent, which is reliable enough for a
 * presence column (it decides an admin icon, not access to anything).
 *
 * "app" — the INSTALLED PWA — cannot be detected from the user-agent at all:
 * a home-screen app sends the same UA as the browser it was installed from.
 * Only the page knows, via display-mode, so the client sends a header. It's
 * self-reported and therefore not to be trusted for anything that matters —
 * here it colours an admin badge, which is exactly the weight it deserves.
 */
export function requestSurface(req: NextRequest): SeenSurface {
  if (req.headers.get("x-teg-standalone") === "1") return "app";
  const ua = req.headers.get("user-agent") ?? "";
  return /Android|iPhone|iPad|iPod|Mobile|Silk/i.test(ua) ? "mobile" : "desktop";
}
