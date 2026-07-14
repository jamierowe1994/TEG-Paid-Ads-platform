import { NextRequest, NextResponse } from "next/server";
import { hasDb, q } from "@/lib/db";
import { pingAll, getAllSocials } from "@/lib/meta";
import { linkedinStatus } from "@/lib/linkedin";
import { whatsappStatus } from "@/lib/whatsapp";
import { rexPing } from "@/lib/rex";
import { ghlPing } from "@/lib/ghl";

// Deployment health check — visit /api/health on the live site to see which
// store the app is actually using. If it says "file-fallback" in production,
// the app service is missing the DATABASE_URL variable (add it as a Railway
// variable reference to the Postgres service).
//
// With the admin password as a bearer token it also returns row counts, so
// you can confirm signups are landing in Postgres without opening the DB.

// The integration probes below expose real detail — Rex account ids, the
// WhatsApp number, token expiry, CRM errors — so they are ADMIN ONLY. Only the
// bare store/connected check is public, so an uptime monitor still works.
const PROBES = ["linkedin", "whatsapp", "rex", "ghl"] as const;

export async function GET(req: NextRequest) {
  const usingDb = hasDb();

  let connected: boolean | null = null;
  if (usingDb) {
    try {
      await q("SELECT 1");
      connected = true;
    } catch {
      connected = false;
    }
  }

  const body: Record<string, unknown> = {
    store: usingDb ? "postgres" : "file-fallback",
    // null = not applicable (file mode); false = DATABASE_URL set but the
    // connection is failing (check the URL / service status)
    connected,
  };

  const auth = req.headers.get("authorization") ?? "";
  const password = process.env.ADMIN_PASSWORD ?? "experts-admin";
  const isAdmin = auth === `Bearer ${password}`;

  // Asking for any integration probe without the admin password gets nothing.
  const wantsProbe = PROBES.some((p) => req.nextUrl.searchParams.has(p));
  if (wantsProbe && !isAdmin) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  if (isAdmin && usingDb && connected) {
    const [users, feedback, leads] = await Promise.all([
      q<{ n: string }>("SELECT COUNT(*)::text AS n FROM users"),
      q<{ n: string }>("SELECT COUNT(*)::text AS n FROM feedback"),
      q<{ n: string }>("SELECT COUNT(*)::text AS n FROM leads"),
    ]);
    body.counts = {
      users: Number(users[0]?.n ?? 0),
      feedback: Number(feedback[0]?.n ?? 0),
      leads: Number(leads[0]?.n ?? 0),
    };
  }

  // /api/health?meta=1 runs a lightweight Meta connection check (no ad data,
  // just whether the token + account work + the account name).
  if (req.nextUrl.searchParams.has("meta")) {
    body.meta = await pingAll();
  }

  // /api/health?social=1 pulls the organic followers snapshot for every
  // Page-configured brand — the fastest way to confirm the Page/Instagram
  // permissions are granted (nulls/errors here = scope or config still missing).
  if (req.nextUrl.searchParams.has("social")) {
    body.social = await getAllSocials();
  }

  // /api/health?linkedin=1 reports whether a LinkedIn token is stored + valid
  // (configured/connected/expiry only — no ad data).
  if (req.nextUrl.searchParams.has("linkedin")) {
    body.linkedin = await linkedinStatus();
  }

  // /api/health?whatsapp=1 confirms the token works + the number's status.
  if (req.nextUrl.searchParams.has("whatsapp")) {
    body.whatsapp = await whatsappStatus();
  }

  // /api/health?rex=1 confirms the Rex login works and lists every account
  // id it can see — the fastest way to find REX_ACCOUNT_ID.
  if (req.nextUrl.searchParams.has("rex")) {
    body.rex = await rexPing();
  }

  // /api/health?ghl=<brandId> checks that brand's own sub-account credentials
  // (GHL_TOKEN_<BRAND>/GHL_LOCATION_<BRAND>); ?ghl=1 checks the shared pair.
  const ghlParam = req.nextUrl.searchParams.get("ghl");
  if (ghlParam !== null) {
    const brand = ghlParam && ghlParam !== "1" ? ghlParam : undefined;
    body.ghl = { brand: brand ?? "(shared)", ...(await ghlPing(brand)) };
  }

  return NextResponse.json(body);
}
