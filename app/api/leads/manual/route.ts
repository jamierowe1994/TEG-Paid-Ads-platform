import { NextRequest, NextResponse } from "next/server";
import { requirePaidUser } from "@/lib/api-guard";
import { createLead, uid } from "@/lib/leads-store";
import { extractPostcode } from "@/lib/geo-uk";
import type { Lead } from "@/lib/types";

export const dynamic = "force-dynamic";

// An agent adds their own lead — their own Google Ads spend, canvassing,
// word of mouth — so everything they're working lives in ONE funnel.
//
// Name, mobile and email are mandatory (James): a lead you can't contact
// isn't a lead, and half-filled manual entries are how a funnel becomes a
// junk drawer. Everything else is optional.
//
// notify: false — they typed it in themselves two seconds ago; a WhatsApp
// and a push about it would be noise.

const SOURCES = new Set(["self", "google", "website", "canvassing", "other"]);

export async function POST(req: NextRequest) {
  const guard = await requirePaidUser(req);
  if (guard.error) return guard.error;
  const body = await req.json().catch(() => null);

  const name = String(body?.name ?? "").trim();
  const phone = String(body?.phone ?? "").trim();
  const email = String(body?.email ?? "").trim();
  const source = String(body?.source ?? "self");
  const address = String(body?.address ?? "").trim();
  const note = String(body?.note ?? "").trim();

  if (!name || !phone || !email) {
    return NextResponse.json(
      { error: "Name, mobile and email are all required." },
      { status: 400 }
    );
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "That email doesn't look right." }, { status: 400 });
  }
  if (phone.replace(/\D/g, "").length < 10) {
    return NextResponse.json({ error: "That mobile number looks too short." }, { status: 400 });
  }
  if (!SOURCES.has(source)) {
    return NextResponse.json({ error: "Pick a lead source from the list." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const lead: Lead = {
    id: uid(),
    name,
    phone,
    email,
    source: source as Lead["source"],
    note,
    stage: "new",
    receivedAt: now,
    history: [{ stage: "new", at: now, label: "Added by you" }],
    adName: null,
    campaignId: null,
    ...(address
      ? { address, postcode: extractPostcode(address) }
      : {}),
  };
  const inserted = await createLead(guard.user.id, lead, { notify: false });
  if (!inserted) {
    return NextResponse.json({ error: "Couldn't save the lead." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, lead });
}
