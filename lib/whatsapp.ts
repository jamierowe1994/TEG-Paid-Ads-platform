import "server-only";

// WhatsApp new-lead alerts via Meta's WhatsApp Cloud API. When a lead lands,
// the owning agent gets a WhatsApp from the Experts Group number nudging them
// to jump on it, with a button back to the portal.
//
// Config (secrets live in Railway, never in the repo):
//   WHATSAPP_TOKEN         — Cloud API access token (from the WABA / system user)
//   WHATSAPP_PHONE_ID      — the WhatsApp Business phone number ID
//   WHATSAPP_TEMPLATE      — approved template name (default "new_lead")
//   WHATSAPP_NUDGE_TEMPLATE — approved reminder template (default "lead_reminder")
//   WHATSAPP_TEMPLATE_LANG — template language code (default "en_GB")
//   APP_URL                — portal origin, used in the message's link button
//
// Proactive messages to people who haven't messaged us in 24h MUST use an
// approved template — see docs for the exact template text to submit.

const GRAPH = "https://graph.facebook.com/v21.0";

export function whatsappConfigured(): boolean {
  return !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID);
}

// Normalise a UK mobile to the digits-only E.164 the API expects
// (07123 456789 -> 447123456789). Returns null if it doesn't look valid.
function toE164(mobile: string): string | null {
  let d = (mobile || "").replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("0")) d = "44" + d.slice(1);
  else if (d.startsWith("44")) {
    /* already prefixed */
  } else if (d.length === 10) d = "44" + d;
  return d.length >= 11 ? d : null;
}

// Health check for the admin/health endpoint: confirms the token is valid and
// reports the number's registration + verification status (no message data).
export async function whatsappStatus(): Promise<{
  configured: boolean;
  ok?: boolean;
  number?: string;
  name?: string;
  verified?: boolean;
  error?: string;
}> {
  if (!whatsappConfigured()) return { configured: false };
  try {
    const res = await fetch(
      `${GRAPH}/${process.env.WHATSAPP_PHONE_ID}?fields=display_phone_number,verified_name,code_verification_status`,
      {
        headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
        cache: "no-store",
      }
    );
    const data = (await res.json()) as {
      display_phone_number?: string;
      verified_name?: string;
      code_verification_status?: string;
      error?: { message?: string };
    };
    if (!res.ok) {
      return {
        configured: true,
        ok: false,
        error: data?.error?.message ?? `HTTP ${res.status}`,
      };
    }
    return {
      configured: true,
      ok: true,
      number: data.display_phone_number,
      name: data.verified_name,
      verified: data.code_verification_status === "VERIFIED",
    };
  } catch (e) {
    return {
      configured: true,
      ok: false,
      error: e instanceof Error ? e.message : "WhatsApp unreachable",
    };
  }
}

// Fire a "new lead" alert. Best-effort: never throws, so it can't break lead
// creation. First body param is the agent's name, second is the lead's name.
export async function sendNewLeadAlert(opts: {
  toMobile: string;
  agentName: string;
  leadName: string;
}): Promise<void> {
  if (!whatsappConfigured()) return;
  const to = toE164(opts.toMobile);
  if (!to) return;

  const name = process.env.WHATSAPP_TEMPLATE ?? "new_lead";
  const lang = process.env.WHATSAPP_TEMPLATE_LANG ?? "en_GB";
  const body = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name,
      language: { code: lang },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: opts.agentName || "there" },
            { type: "text", text: opts.leadName || "a new lead" },
          ],
        },
      ],
    },
  };

  try {
    const res = await fetch(`${GRAPH}/${process.env.WHATSAPP_PHONE_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    // The response USED TO BE IGNORED ENTIRELY, which made this unfalsifiable:
    // an expired token (401) or a paused template (400) looked exactly like a
    // successful send, so "I've had no pings" gave no clue whether anything
    // was broken. Sending stays best-effort — a failed alert must never affect
    // lead creation — but it is no longer silent.
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as {
        error?: { message?: string; code?: number };
      } | null;
      console.error(
        `[whatsapp] new-lead alert REJECTED (${res.status}):`,
        data?.error?.message ?? "no detail",
        data?.error?.code ? `code=${data.error.code}` : ""
      );
    }
  } catch (e) {
    console.error(
      "[whatsapp] new-lead alert failed to send:",
      e instanceof Error ? e.message : String(e)
    );
  }
}

// Admin-triggered nudge: prompt an agent to go back to a lead that's going
// cold. Unlike the new-lead alert this reports its outcome, so the admin gets
// real feedback (sent / WhatsApp not live yet / bad number / API error).
export async function sendLeadNudge(opts: {
  toMobile: string;
  agentName: string;
  leadName: string;
}): Promise<{ ok: boolean; reason?: string }> {
  if (!whatsappConfigured()) return { ok: false, reason: "not_configured" };
  const to = toE164(opts.toMobile);
  if (!to) return { ok: false, reason: "bad_number" };

  const name = process.env.WHATSAPP_NUDGE_TEMPLATE ?? "lead_reminder";
  const lang = process.env.WHATSAPP_TEMPLATE_LANG ?? "en_GB";
  const body = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name,
      language: { code: lang },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: opts.agentName || "there" },
            { type: "text", text: opts.leadName || "a lead" },
          ],
        },
      ],
    },
  };

  try {
    const res = await fetch(
      `${GRAPH}/${process.env.WHATSAPP_PHONE_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      return { ok: false, reason: data?.error?.message ?? `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "unreachable" };
  }
}

// Admin test send: fires the real `new_lead` template at a chosen number and
// reports Meta's exact response — proof the whole chain (token, number,
// approved template, delivery) works before any real lead relies on it.
export async function sendWhatsAppTest(
  toMobile: string
): Promise<{ ok: boolean; reason?: string }> {
  if (!whatsappConfigured()) return { ok: false, reason: "not_configured" };
  const to = toE164(toMobile);
  if (!to) return { ok: false, reason: "bad_number" };

  const name = process.env.WHATSAPP_TEMPLATE ?? "new_lead";
  const lang = process.env.WHATSAPP_TEMPLATE_LANG ?? "en_GB";
  const body = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name,
      language: { code: lang },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: "there" },
            { type: "text", text: "Portal Test Lead" },
          ],
        },
      ],
    },
  };

  try {
    const res = await fetch(
      `${GRAPH}/${process.env.WHATSAPP_PHONE_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      return { ok: false, reason: data?.error?.message ?? `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "unreachable" };
  }
}
