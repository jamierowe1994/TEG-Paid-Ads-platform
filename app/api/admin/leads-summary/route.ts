import { NextRequest, NextResponse } from "next/server";
import { summariseLeadsByUser } from "@/lib/leads-store";
import { listUsers } from "@/lib/users-store";
import { adminScope } from "@/lib/admin-auth";

// Per-user lead totals + conversions. Super sees every agent; an MD only their
// own brand's.
export async function GET(req: NextRequest) {
  const scope = adminScope(req);
  if (!scope) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const summary = await summariseLeadsByUser();
  if (scope.role === "md") {
    const mine = new Set(
      (await listUsers())
        .filter((u) => u.brandId === scope.brandId)
        .map((u) => u.id)
    );
    return NextResponse.json(summary.filter((s) => mine.has(s.userId)));
  }
  return NextResponse.json(summary);
}
