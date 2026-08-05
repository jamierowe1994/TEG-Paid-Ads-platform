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

  /* Finding the WABA id is fiddly: Meta exposes it in different places
     depending on how the token was issued, and not at all on some. Try the
     cheap routes in order rather than making someone go and find it. */
  const tried: string[] = [];
  let waba: string | null = process.env.WHATSAPP_WABA_ID?.trim() || null;
  if (waba) tried.push("WHATSAPP_WABA_ID (configured)");

  // 1. On the phone number node itself.
  if (!waba) {
    const r = await graph(String(process.env.WHATSAPP_PHONE_ID), {
      fields: "id,display_phone_number,verified_name,whatsapp_business_account",
    });
    waba =
      (r.data as { whatsapp_business_account?: { id?: string } } | null)
        ?.whatsapp_business_account?.id ?? null;
    tried.push(`phone.whatsapp_business_account → ${waba ?? "nothing"}`);
  }

  // 2. Walk up: the phone number belongs to a WABA, which owns message
  //    templates. Asking the phone node for its owner works on some versions.
  if (!waba) {
    const r = await graph(`${process.env.WHATSAPP_PHONE_ID}`, { fields: "account_id" });
    waba = (r.data as { account_id?: string } | null)?.account_id ?? null;
    tried.push(`phone.account_id → ${waba ?? "nothing"}`);
  }

  // 3. A System User token can list the businesses it belongs to, and each
  //    business owns its WhatsApp accounts.
  if (!waba) {
    const biz = await graph("me/businesses", { fields: "id,name", limit: "20" });
    const businesses = ((biz.data as { data?: Array<{ id?: string }> } | null)?.data ?? []);
    tried.push(`me/businesses → ${businesses.length} business(es)`);
    for (const b of businesses) {
      if (!b.id) continue;
      const owned = await graph(`${b.id}/owned_whatsapp_business_accounts`, {
        fields: "id,name",
        limit: "20",
      });
      const accounts = ((owned.data as { data?: Array<{ id?: string }> } | null)?.data ?? []);
      if (accounts[0]?.id) {
        waba = accounts[0].id;
        tried.push(`business ${b.id} owns WABA ${waba}`);
        break;
      }
    }
  }

  if (!waba) {
    return NextResponse.json({
      error:
        "Couldn't find the WhatsApp Business Account id automatically. In Meta: WhatsApp Manager → the number → API Setup — it's the 'WhatsApp Business Account ID'. Add it as WHATSAPP_WABA_ID.",
      tried,
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
    howFound: tried,
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
