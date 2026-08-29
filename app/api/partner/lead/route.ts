import { NextRequest, NextResponse } from "next/server";
import { findByEmail } from "@/lib/users-store";
import { getLead, addLeadNote, setLeadFollowUp } from "@/lib/leads-store";
import type { Lead } from "@/lib/types";

/**
 * Partner API — one lead, and the two things you do to it from outside.
 *
 *   GET  /api/partner/lead?email=&id=            → the whole record
 *   POST /api/partner/lead  { email, id, action } → note | follow-up
 *   Authorization: Bearer <PARTNER_API_KEY>
 *
 * ── Shared, not synced ────────────────────────────────────────────────────
 *
 * TLE OS shows this funnel in its own chrome, and James wants a note left in
 * either place to appear in both. The tempting build is to copy notes across
 * and reconcile them, which needs conflict rules, ordering and a duplicate
 * story the first time a request retries.
 *
 * None of that is necessary, because there is only ever ONE copy. The note
 * lives here; TLE OS reads it here and writes it here. "Both directions"
 * falls out of there being no second version to disagree with, and the
 * feature nobody has to maintain is the one that was never built.
 *
 * ── Why writes cannot reach another agent's lead ──────────────────────────
 *
 * The shared key authenticates the CALLER, not the person. So every write is
 * scoped by resolving the email to a user and passing that user id down —
 * `addLeadNote` and `setLeadFollowUp` both carry `WHERE id = $2 AND user_id =
 * $1`, so a wrong or malicious id changes nothing rather than changing
 * somebody else's record. The scope is enforced in SQL, not by a check that
 * could be forgotten.
 *
 * ── What is deliberately NOT here ─────────────────────────────────────────
 *
 * Advancing the stage, booking, marking lost, and pushing to REX. Those carry
 * side effects — GHL tags, CRM writes, WhatsApp — and belong in one place
 * until there is a reason otherwise. A note and a reminder change nothing
 * outside this table, which is what makes them safe to expose first.
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

const APP = (process.env.APP_URL ?? "https://launchpad.theexpertsgroup.co.uk").replace(/\/$/, "");

function shape(l: Lead) {
  return {
    id: l.id,
    name: l.name,
    phone: l.phone,
    email: l.email,
    source: l.source,
    stage: l.stage,
    note: l.note,
    receivedAt: l.receivedAt,
    followUpAt: l.followUpAt ?? null,
    appointmentAt: l.appointmentAt ?? null,
    archivedAt: l.archivedAt ?? null,
    adName: l.adName ?? null,
    address: l.address ?? null,
    postcode: l.postcode ?? null,
    /* Oldest first, which is how a timeline reads. */
    notes: (l.notes ?? []).slice().sort((a, b) => a.at.localeCompare(b.at)),
    history: l.history ?? [],
    deepLink: `${APP}/dashboard/leads?lead=${encodeURIComponent(l.id)}`,
  };
}

/** Resolve the caller's person and their lead, or the reason we cannot. */
async function resolve(email: string, id: string) {
  const user = await findByEmail(email.trim().toLowerCase());
  if (!user) return { error: "No Launch Pad account for that address.", status: 404 as const };
  const lead = await getLead(user.id, id);
  /* Not found and not-yours are answered identically on purpose: a shared key
     should not be able to probe which lead ids exist under another agent. */
  if (!lead) return { error: "No such lead.", status: 404 as const };
  return { user, lead };
}

export async function GET(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const email = (req.nextUrl.searchParams.get("email") ?? "").trim();
  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  if (!email || !id) {
    return NextResponse.json({ error: "email and id are required" }, { status: 400 });
  }
  const r = await resolve(email, id);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ lead: shape(r.lead) });
}

export async function POST(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    email?: string;
    id?: string;
    action?: string;
    text?: string;
    at?: string | null;
    label?: string;
  } | null;

  const email = (body?.email ?? "").trim();
  const id = (body?.id ?? "").trim();
  if (!email || !id) {
    return NextResponse.json({ error: "email and id are required" }, { status: 400 });
  }

  const r = await resolve(email, id);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });

  if (body?.action === "note") {
    const text = (body.text ?? "").trim();
    if (!text) return NextResponse.json({ error: "text is required" }, { status: 400 });
    /* Capped so a paste of a whole email thread cannot bloat the row. */
    const lead = await addLeadNote(r.user.id, id, text.slice(0, 4000));
    return NextResponse.json({ lead: lead ? shape(lead) : null });
  }

  if (body?.action === "follow-up") {
    /* null clears it — "actually, I'll ring them today" has to be expressible,
       or a reminder set by accident can never be taken off. */
    const at = body.at ? new Date(body.at) : null;
    if (body.at && Number.isNaN(at!.getTime())) {
      return NextResponse.json({ error: "at must be a date" }, { status: 400 });
    }
    const lead = await setLeadFollowUp(
      r.user.id,
      id,
      at ? at.toISOString() : null,
      (body.label ?? "").trim() || undefined
    );
    return NextResponse.json({ lead: lead ? shape(lead) : null });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
