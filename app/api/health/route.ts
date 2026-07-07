import { NextRequest, NextResponse } from "next/server";
import { hasDb, q } from "@/lib/db";

// Deployment health check — visit /api/health on the live site to see which
// store the app is actually using. If it says "file-fallback" in production,
// the app service is missing the DATABASE_URL variable (add it as a Railway
// variable reference to the Postgres service).
//
// With the admin password as a bearer token it also returns row counts, so
// you can confirm signups are landing in Postgres without opening the DB.

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
  if (auth === `Bearer ${password}` && usingDb && connected) {
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

  return NextResponse.json(body);
}
