import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth";
import {
  addFeedback,
  listFeedback,
  type FeedbackItem,
} from "@/lib/feedback-store";

// Feedback from the on-page annotation widget. Stored in Postgres on
// Railway (JSON file locally) — see lib/feedback-store.ts.

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.note !== "string" || !body.note.trim()) {
    return NextResponse.json({ error: "A note is required" }, { status: 400 });
  }

  const item: FeedbackItem = {
    id: Math.random().toString(36).slice(2, 10) + Date.now().toString(36),
    note: String(body.note).slice(0, 2000),
    page: String(body.page ?? "").slice(0, 500),
    email: body.email ? String(body.email).slice(0, 200) : null,
    screenshot:
      typeof body.screenshot === "string" &&
      body.screenshot.startsWith("data:image/")
        ? body.screenshot
        : null,
    userAgent: req.headers.get("user-agent") ?? "",
    createdAt: new Date().toISOString(),
  };

  await addFeedback(item);
  return NextResponse.json({ ok: true, id: item.id });
}

// Notes listing. Visible to the admin (bearer password) AND to any signed-in
// user — the feedback notes are a shared review list so the whole team can
// see what's been flagged and prepare changes.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const password = process.env.ADMIN_PASSWORD ?? "experts-admin";
  const isAdmin = auth === `Bearer ${password}`;
  const isSignedIn = !!verifySessionToken(
    req.cookies.get(SESSION_COOKIE)?.value
  );
  if (!isAdmin && !isSignedIn) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  return NextResponse.json(await listFeedback());
}
