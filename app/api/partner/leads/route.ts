import { NextRequest, NextResponse } from "next/server";
import { findByEmail } from "@/lib/users-store";
import { listLeadsForUser } from "@/lib/leads-store";
import type { Lead } from "@/lib/types";

/**
 * Partner API — an agent's funnel, as Launch Pad itself sees it.
 *
 *   GET /api/partner/leads?email=agent@brand.co.uk
 *   Authorization: Bearer <PARTNER_API_KEY>
 *   → { found, leads[], counts, computedAt }
 *
 * ── Why the PARTITION is computed here ────────────────────────────────────
 *
 * TLE OS is putting this funnel on its own screen so an agent does not need a
 * second login for the everyday view. Launch Pad keeps the leads and stays
 * fully usable — James, 29 Aug: "we don't want to take away the leads from
 * Launch Pad because they might just want to log in there."
 *
 * Two windows onto one book, then. Which makes the split between Uncontacted,
 * Follow-ups and Resting the dangerous part: it is not stored on a lead, it is
 * DERIVED from stage, archivedAt and followUpAt against the clock. Derive it
 * twice, in two codebases, and the two windows disagree — the same agent is
 * told they have four to ring here and six there, and neither number can be
 * trusted afterwards.
 *
 * So it is worked out once, here, next to the rule the dashboard already uses,
 * and shipped as a field. TLE OS renders; it does not re-decide. When the rule
 * changes it changes in one place, and both windows move together.
 *
 * `computedAt` is returned because "resting" depends on the current time: a
 * lead due back at 08:00 is resting at 07:59 and due at 08:01. The caller
 * needs to know how old that judgement is rather than assuming it is now.
 *
 * ── Read only ────────────────────────────────────────────────────────────
 *
 * Nothing here writes. Working a lead — logging an attempt, booking, marking
 * lost — still happens in Launch Pad, which is why each lead carries a
 * `deepLink` straight to its file. The first slice of the TLE OS screen is the
 * list and nothing else, so there is deliberately no write path to get wrong.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authorised(req: NextRequest): boolean {
  const key = process.env.PARTNER_API_KEY;
  if (!key) return false;
  const header = req.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (bearer.length !== key.length) return false;
  let diff = 0;
  for (let i = 0; i < key.length; i++) diff |= bearer.charCodeAt(i) ^ key.charCodeAt(i);
  return diff === 0;
}

/** Where a lead sits today. Derived, never stored — see the note above. */
export type LeadBucket =
  /** Brand new, nobody has tried them. */
  | "uncontacted"
  /** Attempted, and due back now. */
  | "follow-up"
  /** Attempted, with a reminder in the future. Out of both boxes until then. */
  | "resting"
  /** Booked or sent to the CRM. */
  | "won"
  /** In the marketing funnel, lost, or archived. */
  | "closed";

const APP = (process.env.APP_URL ?? "https://launchpad.theexpertsgroup.co.uk").replace(/\/$/, "");

function bucketFor(l: Lead, now: number): LeadBucket {
  if (l.stage === "converted" || l.stage === "pushed") return "won";
  /* Archived, lost and nurture are all "not in front of you today". Kept as one
     bucket because the funnel shows them behind tabs rather than in the working
     list, and splitting them here would invite the caller to re-derive. */
  if (l.archivedAt || l.stage === "lost" || l.stage === "nurture") return "closed";
  const rests = Boolean(l.followUpAt && new Date(l.followUpAt).getTime() > now);
  if (rests) return "resting";
  return l.stage === "new" ? "uncontacted" : "follow-up";
}

export async function GET(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const email = (req.nextUrl.searchParams.get("email") ?? "").trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  const user = await findByEmail(email);
  /* No Launch Pad account is a real, ordinary answer — an entitled partner who
     has not signed up yet. Not an error, and not an empty funnel either, which
     would read as "you have no leads" rather than "you have not started". */
  if (!user) return NextResponse.json({ found: false, leads: [], counts: {} });

  const leads = await listLeadsForUser(user.id);
  const now = Date.now();

  const rows = leads.map((l) => {
    const bucket = bucketFor(l, now);
    return {
      id: l.id,
      name: l.name,
      phone: l.phone,
      email: l.email,
      source: l.source,
      stage: l.stage,
      bucket,
      receivedAt: l.receivedAt,
      followUpAt: l.followUpAt ?? null,
      appointmentAt: l.appointmentAt ?? null,
      archivedAt: l.archivedAt ?? null,
      adName: l.adName ?? null,
      note: l.note,
      /* Straight to the lead's own file. Working a lead still happens in Launch
         Pad, so every row needs a way back to it that lands on the right
         record rather than on a list. */
      deepLink: `${APP}/dashboard/leads?lead=${encodeURIComponent(l.id)}`,
      /* How many times they have actually been tried, which the stage encodes
         but does not say out loud. */
      attempts: l.stage.startsWith("attempt") ? Number(l.stage.slice(7)) || 0 : 0,
    };
  });

  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.bucket] = (acc[r.bucket] ?? 0) + 1;
    return acc;
  }, {});

  return NextResponse.json({
    found: true,
    leads: rows,
    counts,
    /* The clock this was judged against. "Resting" is time-sensitive, so the
       caller must be able to say how fresh the split is rather than implying
       it is live. */
    computedAt: new Date(now).toISOString(),
    appUrl: APP,
  });
}
