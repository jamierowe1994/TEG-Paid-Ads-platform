import { NextRequest, NextResponse } from "next/server";
import { isSuperAdmin } from "@/lib/admin-auth";
import { whatsappStatus } from "@/lib/whatsapp";
import {
  listWhatsAppLog,
  summariseWhatsApp,
  type WhatsAppSummary,
} from "@/lib/whatsapp-log";

/* The WhatsApp monitoring tab's data.
 *
 * Super admin only: it carries agent names, lead names and Meta's raw error
 * text, none of which a brand MD needs and some of which is other brands'.
 *
 * ?days=1|7|30 changes the summary window. The row list is always the most
 * recent 200 regardless, so the table stays useful when a window is quiet.
 */
export async function GET(req: NextRequest) {
  if (!isSuperAdmin(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const days = Math.min(30, Math.max(1, Number(req.nextUrl.searchParams.get("days") ?? 7)));

  const entries = await listWhatsAppLog(200);
  const summaries: Record<string, WhatsAppSummary> = {
    window: summariseWhatsApp(entries, days),
    day: summariseWhatsApp(entries, 1),
  };

  // The connection check goes in the same payload so the tab can tell the two
  // apart: "nothing sent because nothing happened" and "nothing sent because
  // the token expired" look identical from the log alone.
  const status = await whatsappStatus();

  return NextResponse.json({
    status,
    summary: summaries.window,
    today: summaries.day,
    entries,
    // Delivery receipts need Meta's status webhook pointed at us. Until it
    // is, "accepted" is the strongest thing we can honestly claim.
    deliveryWebhook: !!process.env.WHATSAPP_VERIFY_TOKEN,
  });
}
