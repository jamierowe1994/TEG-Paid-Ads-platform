// Read the approved WhatsApp template back from Meta.
//
// Needed because the template is the one part of the lead alert we can't
// change without re-approval — so before working around its button, it's worth
// knowing exactly what that button is. In particular: whether the URL is
// STATIC (baked in, we can only change what lives at that address) or DYNAMIC
// (ends in a {{1}} placeholder, in which case we can point each message at a
// specific lead just by sending a button parameter).
//
// Read-only. Super admin only.

import { NextRequest, NextResponse } from "next/server";
import { isSuperAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
const GRAPH = "https://graph.facebook.com/v21.0";

async function graph(path: string, params: Record<string, string> = {}) {
  const q = new URLSearchParams({
    access_token: process.env.WHATSAPP_TOKEN ?? "",
    ...params,
  });
  const res = await fetch(`${GRAPH}/${path}?${q}`, { cache: "no-store" });
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => null) };
}

export async function GET(req: NextRequest) {
  if (!isSuperAdmin(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  if (!process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_PHONE_ID) {
    return NextResponse.json({ error: "WhatsApp isn't configured." }, { status: 503 });
  }

  const wanted = new Set(
    [
      process.env.WHATSAPP_TEMPLATE ?? "new_lead",
      process.env.WHATSAPP_NUDGE_TEMPLATE ?? "lead_reminder",
    ].map((s) => s.toLowerCase())
  );

  /* The WABA id isn't configured anywhere, so find it from the phone number.
     Meta exposes it on the phone number node under a couple of different
     names depending on the API version — try each rather than guessing. */
  const probe = await graph(String(process.env.WHATSAPP_PHONE_ID), {
    fields: "id,display_phone_number,verified_name,whatsapp_business_account",
  });
  const waba =
    (probe.data as { whatsapp_business_account?: { id?: string } } | null)
      ?.whatsapp_business_account?.id ?? process.env.WHATSAPP_WABA_ID ?? null;

  if (!waba) {
    return NextResponse.json({
      error:
        "Couldn't work out the WhatsApp Business Account id from the phone number. Set WHATSAPP_WABA_ID and try again.",
      phoneProbe: probe.data,
    });
  }

  const list = await graph(`${waba}/message_templates`, { limit: "100" });
  if (!list.ok) {
    return NextResponse.json(
      { error: "Couldn't list templates", detail: list.data },
      { status: 502 }
    );
  }

  const all = ((list.data as { data?: unknown[] } | null)?.data ?? []) as Array<{
    name?: string;
    status?: string;
    language?: string;
    components?: Array<{
      type?: string;
      text?: string;
      buttons?: Array<{ type?: string; text?: string; url?: string }>;
    }>;
  }>;

  const ours = all.filter((t) => wanted.has(String(t.name ?? "").toLowerCase()));

  return NextResponse.json({
    wabaId: waba,
    found: ours.length,
    templates: ours.map((t) => {
      const buttons = (t.components ?? []).flatMap((c) => c.buttons ?? []);
      return {
        name: t.name,
        status: t.status,
        language: t.language,
        body: (t.components ?? []).find((c) => c.type === "BODY")?.text ?? null,
        buttons: buttons.map((b) => ({
          type: b.type,
          text: b.text,
          url: b.url ?? null,
          // The whole point of this endpoint.
          isDynamic: typeof b.url === "string" && b.url.includes("{{"),
        })),
      };
    }),
    otherTemplateNames: all
      .map((t) => t.name)
      .filter((n) => n && !wanted.has(String(n).toLowerCase())),
  });
}
