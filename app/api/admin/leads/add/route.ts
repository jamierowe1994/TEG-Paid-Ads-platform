import { NextRequest, NextResponse } from "next/server";
import { createLead, uid } from "@/lib/leads-store";
import { findById } from "@/lib/users-store";
import type { Lead, LeadStage } from "@/lib/types";

function authorised(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const password = process.env.ADMIN_PASSWORD ?? "experts-admin";
  return auth === `Bearer ${password}`;
}

const VALID_STAGES: LeadStage[] = [
  "new",
  "attempt1",
  "attempt2",
  "attempt3",
  "nurture",
  "converted",
  "pushed",
  "lost",
];

// Admin tool: manually add a lead straight into an agent's funnel — for
// seeding test data (e.g. an agent's first account, before real leads are
// flowing) or logging one that came in outside the usual channels.
// Body: { userId, name, phone?, email?, source?, note?, stage? }
export async function POST(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const userId = String(body?.userId ?? "");
  const name = String(body?.name ?? "").trim();
  if (!userId || !name) {
    return NextResponse.json(
      { error: "userId and name are required" },
      { status: 400 }
    );
  }
  const agent = await findById(userId);
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const source = String(body?.source ?? "facebook");
  const stageRaw = String(body?.stage ?? "new");
  const stage: LeadStage = VALID_STAGES.includes(stageRaw as LeadStage)
    ? (stageRaw as LeadStage)
    : "new";
  const now = new Date().toISOString();

  const lead: Lead = {
    id: uid(),
    name,
    phone: String(body?.phone ?? "").trim(),
    email: String(body?.email ?? "").trim(),
    source: (["facebook", "instagram", "referral"].includes(source)
      ? source
      : "facebook") as Lead["source"],
    note: String(body?.note ?? "").trim() || "Added manually by admin",
    stage,
    receivedAt: now,
    history: [{ stage, at: now }],
  };

  await createLead(userId, lead, { notify: false });
  return NextResponse.json({ ok: true, lead });
}
