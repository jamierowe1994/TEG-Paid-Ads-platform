import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { DATA_DIR } from "./data-dir";
import { hasDb, q } from "./db";

// Feedback (annotation widget) store — Postgres on Railway, JSON locally.

export interface FeedbackItem {
  id: string;
  note: string;
  page: string;
  email: string | null;
  screenshot: string | null;
  userAgent: string;
  createdAt: string;
}

const FILE = path.join(DATA_DIR, "feedback.json");

interface FeedbackRow {
  id: string;
  note: string;
  page: string;
  email: string | null;
  screenshot: string | null;
  user_agent: string;
  created_at: string | Date;
}

function fromRow(row: FeedbackRow): FeedbackItem {
  return {
    id: row.id,
    note: row.note,
    page: row.page,
    email: row.email,
    screenshot: row.screenshot,
    userAgent: row.user_agent,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

async function readAllFile(): Promise<FeedbackItem[]> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8")) as FeedbackItem[];
  } catch {
    return [];
  }
}

export async function addFeedback(item: FeedbackItem): Promise<void> {
  if (hasDb()) {
    await q(
      `INSERT INTO feedback (id, note, page, email, screenshot, user_agent, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        item.id,
        item.note,
        item.page,
        item.email,
        item.screenshot,
        item.userAgent,
        item.createdAt,
      ]
    );
    return;
  }
  const all = await readAllFile();
  all.unshift(item);
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(all, null, 2), "utf8");
}

export async function listFeedback(): Promise<FeedbackItem[]> {
  if (hasDb()) {
    const rows = await q<FeedbackRow>(
      "SELECT * FROM feedback ORDER BY created_at DESC"
    );
    return rows.map(fromRow);
  }
  return readAllFile();
}
