import { NextRequest, NextResponse } from "next/server";
import { listAllLeads } from "@/lib/leads-store";
import { listUsers } from "@/lib/users-store";

function authorised(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const password = process.env.ADMIN_PASSWORD ?? "experts-admin";
  return auth === `Bearer ${password}`;
}

const DAY = 86400000;

// Admin activity: a chronological feed of recent lead/signup events across the
// whole group, plus an "attention needed" list of leads going unanswered or
// cold — so the team can keep on top of every client.
export async function GET(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const [leads, users] = await Promise.all([listAllLeads(), listUsers()]);
  const userMap = new Map(users.map((u) => [u.id, u]));
  const now = Date.now();

  type Ev = {
    at: string;
    type: "new_lead" | "converted" | "pushed" | "lost" | "signup";
    agentName: string;
    brandId: string;
    leadName?: string;
    source?: string;
  };
  const events: Ev[] = [];
  const attention: {
    kind: "unanswered" | "cold";
    leadName: string;
    agentName: string;
    brandId: string;
    ageMs: number;
  }[] = [];

  for (const lead of leads) {
    const u = userMap.get(lead.userId);
    if (!u) continue;
    const base = {
      agentName: u.name,
      brandId: u.brandId,
      leadName: lead.name,
      source: lead.source,
    };
    events.push({ ...base, at: lead.receivedAt, type: "new_lead" });
    for (const h of lead.history) {
      if (h.stage === "converted")
        events.push({ ...base, at: h.at, type: "converted" });
      else if (h.stage === "pushed")
        events.push({ ...base, at: h.at, type: "pushed" });
      else if (h.stage === "lost")
        events.push({ ...base, at: h.at, type: "lost" });
    }

    // Attention: still "new" for >1 day, or working but no activity for >2 days.
    if (lead.stage === "new") {
      const age = now - new Date(lead.receivedAt).getTime();
      if (age > DAY)
        attention.push({
          kind: "unanswered",
          leadName: lead.name,
          agentName: u.name,
          brandId: u.brandId,
          ageMs: age,
        });
    } else if (
      ["attempt1", "attempt2", "attempt3", "nurture"].includes(lead.stage)
    ) {
      const last = lead.history.at(-1)?.at ?? lead.receivedAt;
      const age = now - new Date(last).getTime();
      if (age > 2 * DAY)
        attention.push({
          kind: "cold",
          leadName: lead.name,
          agentName: u.name,
          brandId: u.brandId,
          ageMs: age,
        });
    }
  }

  for (const u of users) {
    events.push({
      at: u.createdAt,
      type: "signup",
      agentName: u.name,
      brandId: u.brandId,
    });
  }

  events.sort((a, b) => b.at.localeCompare(a.at));
  attention.sort((a, b) => b.ageMs - a.ageMs);

  return NextResponse.json({ events: events.slice(0, 50), attention });
}
