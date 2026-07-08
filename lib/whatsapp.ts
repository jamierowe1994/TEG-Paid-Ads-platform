import "server-only";

// WhatsApp new-lead alerts via Meta's WhatsApp Cloud API. When a lead lands,
// the owning agent gets a WhatsApp from the Experts Group number nudging them
// to jump on it, with a button back to the portal.
//
// Config (secrets live in Railway, never in the repo):
//   WHATSAPP_TOKEN         — Cloud API access token (from the WABA / system user)
//   WHATSAPP_PHONE_ID      — the WhatsApp Business phone number ID
//   WHATSAPP_TEMPLATE      — approved template name (default "new_lead")
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
    await fetch(`${GRAPH}/${process.env.WHATSAPP_PHONE_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch {
    /* alerting is best-effort — swallow errors */
  }
}
