import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth";
import {
  addLeadNote,
  bookAppointment,
  cancelAppointment,
} from "@/lib/leads-store";

// Per-lead actions from the detail modal:
//   { leadId, action: "note", text }         — add an agent note
//   { leadId, action: "book", at }           — book/rearrange an appointment
//   { leadId, action: "cancelBooking" }      — cancel the appointment
export async function POST(req: NextRequest) {
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const leadId = String(body?.leadId ?? "");
  const action = String(body?.action ?? "");
  if (!leadId) {
    return NextResponse.json({ error: "leadId required" }, { status: 400 });
  }

  let lead;
  if (action === "note") {
    lead = await addLeadNote(userId, leadId, String(body?.text ?? ""));
  } else if (action === "book") {
    const at = String(body?.at ?? "");
    if (!at || Number.isNaN(new Date(at).getTime())) {
      return NextResponse.json({ error: "Valid date required" }, { status: 400 });
    }
    lead = await bookAppointment(userId, leadId, at);
  } else if (action === "cancelBooking") {
    lead = await cancelAppointment(userId, leadId);
  } else {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }
  return NextResponse.json(lead);
}
