import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

// Feedback from the on-page annotation widget. Stored as JSON on disk for
// the framework stage — swap for a database (or forward to Slack/email)
// before real launch. Note: Railway's filesystem is ephemeral, so stored
// feedback survives only until the next deploy.

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "feedback.json");

interface FeedbackItem {
  id: string;
  note: string;
  page: string;
  email: string | null;
  screenshot: string | null; // data URL (annotated screenshot)
  userAgent: string;
  createdAt: string;
}

async function readAll(): Promise<FeedbackItem[]> {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    return JSON.parse(raw) as FeedbackItem[];
  } catch {
    return [];
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.note !== "string" || !body.note.trim()) {
    return NextResponse.json({ error: "A note is required" }, { status: 400 });
  }

  const item: FeedbackItem = {
    id: Math.random().toString(36).slice(2, 10),
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

  const all = await readAll();
  all.unshift(item);
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(all, null, 2), "utf8");

  return NextResponse.json({ ok: true, id: item.id });
}

// Admin-only listing. The admin dashboard sends the admin password as a
// bearer token — replace with real auth later.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const password = process.env.ADMIN_PASSWORD ?? "experts-admin";
  if (auth !== `Bearer ${password}`) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  return NextResponse.json(await readAll());
}
