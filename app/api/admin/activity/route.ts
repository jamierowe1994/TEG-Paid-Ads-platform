import { NextRequest, NextResponse } from "next/server";
import { listAllLeads } from "@/lib/leads-store";
import { listUsers } from "@/lib/users-store";
import { adminScope } from "@/lib/admin-auth";

const DAY = 86400000;

// Admin activity: a chronological feed of recent lead/signup events, plus an
// "attention needed" list of leads going unanswered or cold. Super sees the
// whole group; an MD sees only their own brand.
export async function GET(req: NextRequest) {
  const scope = adminScope(req);
  if (!scope) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const [allLeads, allUsers] = await Promise.all([listAllLeads(), listUsers()]);
  const users =
    scope.role === "md"
      ? allUsers.filter((u) => u.brandId === scope.brandId)
      : allUsers;
  const userMap = new Map(users.map((u) => [u.id, u]));
  // Leads only for visible users (an MD never sees another brand's leads).
  const leads = allLeads.filter((l) => userMap.has(l.userId));
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
    userId: string;
    brandId: string;
    ageMs: number;
  }[] = [];
  // Lead-centric rows for the CRM-style activity table.
  const activityLeads: {
    id: string;
    leadName: string;
    agentName: string;
    userId: string;
    brandId: string;
    source: string;
    stage: string;
    receivedAt: string;
    lastAt: string;
    appointmentAt: string | null;
    history: { stage: string; at: string }[];
    notes: { at: string; text: string }[];
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

    const lastAt = lead.history.at(-1)?.at ?? lead.receivedAt;
    activityLeads.push({
      id: lead.id,
      leadName: lead.name,
      agentName: u.name,
      userId: lead.userId,
      brandId: u.brandId,
      source: lead.source,
      stage: lead.stage,
      receivedAt: lead.receivedAt,
      lastAt,
      appointmentAt: lead.appointmentAt ?? null,
      history: lead.history,
      notes: lead.notes ?? [],
    });

    // Attention: still "new" for >1 day, or working but no activity for >2 days.
    if (lead.stage === "new") {
      const age = now - new Date(lead.receivedAt).getTime();
      if (age > DAY)
        attention.push({
          kind: "unanswered",
          leadName: lead.name,
          agentName: u.name,
          userId: lead.userId,
          brandId: u.brandId,
          ageMs: age,
        });
    } else if (
      ["attempt1", "attempt2", "attempt3", "nurture"].includes(lead.stage)
    ) {
      const age = now - new Date(lastAt).getTime();
      if (age > 2 * DAY)
        attention.push({
          kind: "cold",
          leadName: lead.name,
          agentName: u.name,
          userId: lead.userId,
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
  activityLeads.sort((a, b) => b.lastAt.localeCompare(a.lastAt));

  return NextResponse.json({
    events: events.slice(0, 50),
    attention,
    leads: activityLeads,
  });
}
