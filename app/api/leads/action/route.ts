import { NextRequest, NextResponse } from "next/server";
import { requirePaidUser } from "@/lib/api-guard";
import {
  addLeadNote,
  bookAppointment,
  cancelAppointment,
  updateLeadFields,
} from "@/lib/leads-store";

// Normalise a free-text UK postcode; empty/invalid → null.
function cleanPostcode(raw: unknown): string | null {
  const s = String(raw ?? "").trim().toUpperCase().replace(/\s+/g, " ");
  return s || null;
}

// Per-lead actions from the detail modal:
//   { leadId, action: "note", text }         — add an agent note
//   { leadId, action: "book", at }           — book/rearrange an appointment
//   { leadId, action: "cancelBooking" }      — cancel the appointment
//   { leadId, action: "update", fields }     — edit name/contact/address inline
export async function POST(req: NextRequest) {
  const guard = await requirePaidUser(req);
  if (guard.error) return guard.error;
  const userId = guard.user.id;
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
  } else if (action === "update") {
    const f = body?.fields ?? {};
    const patch: Record<string, unknown> = {};
    if (typeof f.name === "string") patch.name = f.name.trim();
    if (typeof f.phone === "string") patch.phone = f.phone.trim();
    if (typeof f.email === "string") patch.email = f.email.trim();
    if (typeof f.address === "string" || f.address === null)
      patch.address = f.address ? String(f.address).trim() : null;
    if (typeof f.postcode === "string" || f.postcode === null)
      patch.postcode = cleanPostcode(f.postcode);
    if (typeof f.lat === "number" || f.lat === null) patch.lat = f.lat;
    if (typeof f.lng === "number" || f.lng === null) patch.lng = f.lng;
    lead = await updateLeadFields(userId, leadId, patch);
  } else {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }
  return NextResponse.json(lead);
}
