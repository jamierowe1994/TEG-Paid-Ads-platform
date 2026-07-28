import { NextRequest, NextResponse } from "next/server";
import { summariseLeadsByUser } from "@/lib/leads-store";
import { listUsers } from "@/lib/users-store";
import { adminScope } from "@/lib/admin-auth";

// Per-user lead totals + conversions. Super sees every agent; an MD only their
// own brand's.
//
// Optional ?from=&to= (ISO dates) narrows to leads received in that window, so
// the admin date picker moves every figure on the page rather than a subset.
// Invalid or partial dates are ignored rather than erroring — a bad query
// string should show all-time, not a broken page.
export async function GET(req: NextRequest) {
  const scope = adminScope(req);
  if (!scope) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const fromRaw = req.nextUrl.searchParams.get("from");
  const toRaw = req.nextUrl.searchParams.get("to");
  let range: { from: Date; to: Date } | undefined;
  if (fromRaw && toRaw) {
    const from = new Date(fromRaw);
    const to = new Date(toRaw);
    if (!isNaN(from.getTime()) && !isNaN(to.getTime()) && from <= to) {
      range = { from, to };
    }
  }

  const summary = await summariseLeadsByUser(range);
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
