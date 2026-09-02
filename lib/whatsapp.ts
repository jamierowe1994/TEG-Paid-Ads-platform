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

import {
  recordWhatsApp,
  maskNumber,
  type WhatsAppKind,
} from "./whatsapp-log";

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
  /** What a new-lead alert would send right now. */
  template?: string;
  deepLink?: boolean;
  error?: string;
}> {
  if (!whatsappConfigured()) return { configured: false };
  const dyn = dynamicTemplate();
  const templateInfo = {
    template: dyn ?? (process.env.WHATSAPP_TEMPLATE ?? "new_lead"),
    deepLink: !!dyn,
  };
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
      ...templateInfo,
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
/* The deep-linking template. new_lead_link (approved 6 Aug 2026) has a
   dynamic url button — https://launchpad.theexpertsgroup.co.uk/l/{{1}} — so
   every alert can open the exact lead it's about. Defaulted in code so going
   live needed no Railway change; WHATSAPP_TEMPLATE_DYNAMIC overrides the
   name, and setting it to "off" turns deep-linking off entirely (back to the
   static template).

   Still separate from WHATSAPP_TEMPLATE: a button parameter sent to a
   template WITHOUT a dynamic button is rejected by Meta outright, so the two
   must move together or alerts stop arriving. sendNewLeadAlert also retries
   on the static template if Meta rejects the dynamic send — a template
   mishap must degrade the button, not lose the alert. */
function dynamicTemplate(): string | null {
  const v = process.env.WHATSAPP_TEMPLATE_DYNAMIC?.trim();
  if (v?.toLowerCase() === "off") return null;
  return v || "new_lead_link";
}

/** Body params both lead templates share, plus the button when deep-linking. */
function leadComponents(
  agentName: string,
  leadName: string,
  leadId?: string
): Record<string, unknown>[] {
  const components: Record<string, unknown>[] = [
    {
      type: "body",
      parameters: [
        { type: "text", text: agentName || "there" },
        { type: "text", text: leadName || "a new lead" },
      ],
    },
  ];
  if (leadId) {
    // Meta requires the variable to be a URL SUFFIX, so the template holds
    // ".../l/{{1}}" and this supplies just the id.
    components.push({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: leadId }],
    });
  }
  return components;
}

/** POST one template message; returns Meta's verdict instead of throwing.
    Also reports the message id (so the status webhook can match a delivery
    back to this send) and how long Meta took to answer. */
async function postTemplate(
  to: string,
  name: string,
  components: Record<string, unknown>[]
): Promise<{ ok: boolean; reason?: string; messageId?: string; apiMs: number }> {
  const lang = process.env.WHATSAPP_TEMPLATE_LANG ?? "en_GB";
  const started = Date.now();
  try {
    const res = await fetch(`${GRAPH}/${process.env.WHATSAPP_PHONE_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: { name, language: { code: lang }, components },
      }),
    });
    const data = (await res.json().catch(() => null)) as {
      messages?: { id?: string }[];
      error?: { message?: string; code?: number };
    } | null;
    if (res.ok) {
      return {
        ok: true,
        messageId: data?.messages?.[0]?.id,
        apiMs: Date.now() - started,
      };
    }
    return {
      ok: false,
      reason:
        (data?.error?.message ?? `HTTP ${res.status}`) +
        (data?.error?.code ? ` (code ${data.error.code})` : ""),
      apiMs: Date.now() - started,
    };
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : "unreachable",
      apiMs: Date.now() - started,
    };
  }
}

export async function sendNewLeadAlert(opts: {
  toMobile: string;
  agentName: string;
  leadName: string;
  /** Lead id, so the button can open this exact lead. */
  leadId?: string;
  /** Everything below is for the monitoring log only — never the message. */
  userId?: string;
  brandId?: string;
  /** When the lead was SUBMITTED (Meta's own timestamp), not when we saw it.
      This is what makes "how long did the agent wait?" answerable. */
  leadReceivedAt?: string;
  kind?: WhatsAppKind;
}): Promise<void> {
  const kind = opts.kind ?? "new_lead";
  if (!whatsappConfigured()) return;

  // Shared fields for whichever outcome we end up recording.
  const base = {
    kind,
    userId: opts.userId ?? null,
    agentName: opts.agentName ?? "",
    brandId: opts.brandId ?? null,
    leadId: opts.leadId ?? null,
    leadName: opts.leadName ?? "",
    leadReceivedAt: opts.leadReceivedAt ?? null,
    latencyMs: opts.leadReceivedAt
      ? Date.now() - new Date(opts.leadReceivedAt).getTime()
      : null,
  };

  const to = toE164(opts.toMobile);
  if (!to) {
    // A missing or malformed mobile used to be an invisible non-event: the
    // agent simply never heard about their lead and nobody knew. It's a
    // failure, so it's logged as one.
    await recordWhatsApp({
      ...base,
      template: "",
      dynamic: false,
      fellBack: false,
      ok: false,
      reason: opts.toMobile?.trim()
        ? "Not a usable mobile number"
        : "No mobile number on their account",
      toMasked: maskNumber(opts.toMobile ?? ""),
      messageId: null,
      apiMs: null,
    });
    return;
  }

  const dyn = dynamicTemplate();
  const staticName = process.env.WHATSAPP_TEMPLATE ?? "new_lead";
  // Only use the deep-linking template when there's a lead to link to.
  const useDynamic = !!dyn && !!opts.leadId;

  // Alerts stay best-effort — a failed alert must never affect lead creation —
  // but no longer silent: an expired token or paused template used to look
  // exactly like a successful send.
  let fellBack = false;
  if (useDynamic) {
    const r = await postTemplate(
      to,
      dyn!,
      leadComponents(opts.agentName, opts.leadName, opts.leadId)
    );
    if (r.ok) {
      await recordWhatsApp({
        ...base,
        template: dyn!,
        dynamic: true,
        fellBack: false,
        ok: true,
        reason: null,
        toMasked: maskNumber(to),
        messageId: r.messageId ?? null,
        apiMs: r.apiMs,
      });
      return;
    }
    // The deep-link template failing must degrade the BUTTON, not lose the
    // ALERT — fall through and send the static template instead. The log
    // keeps the fallback visible, because a message that arrived without its
    // deep link is a half-failure worth fixing, not a success.
    fellBack = true;
    console.error(
      `[whatsapp] dynamic template ${dyn} REJECTED, falling back to ${staticName}:`,
      r.reason
    );
  }

  const r = await postTemplate(
    to,
    staticName,
    leadComponents(opts.agentName, opts.leadName)
  );
  if (!r.ok) {
    console.error(`[whatsapp] new-lead alert REJECTED (${staticName}):`, r.reason);
  }
  await recordWhatsApp({
    ...base,
    template: staticName,
    dynamic: false,
    fellBack,
    ok: r.ok,
    reason: r.ok ? null : (r.reason ?? "Rejected by Meta"),
    toMasked: maskNumber(to),
    messageId: r.messageId ?? null,
    apiMs: r.apiMs,
  });
}

// Admin-triggered nudge: prompt an agent to go back to a lead that's going
// cold. Unlike the new-lead alert this reports its outcome, so the admin gets
// real feedback (sent / WhatsApp not live yet / bad number / API error).
export async function sendLeadNudge(opts: {
  toMobile: string;
  agentName: string;
  leadName: string;
  userId?: string;
  brandId?: string;
  leadId?: string;
}): Promise<{ ok: boolean; reason?: string }> {
  if (!whatsappConfigured()) return { ok: false, reason: "not_configured" };
  const to = toE164(opts.toMobile);
  if (!to) return { ok: false, reason: "bad_number" };

  const name = process.env.WHATSAPP_NUDGE_TEMPLATE ?? "lead_reminder";
  const r = await postTemplate(
    to,
    name,
    leadComponents(opts.agentName, opts.leadName)
  );
  // Nudges go in the same log as everything else: when the number or the
  // token is the problem, it's the same problem, and splitting the evidence
  // across two places is how it stays unnoticed.
  await recordWhatsApp({
    kind: "nudge",
    userId: opts.userId ?? null,
    agentName: opts.agentName ?? "",
    brandId: opts.brandId ?? null,
    leadId: opts.leadId ?? null,
    leadName: opts.leadName ?? "",
    leadReceivedAt: null,
    latencyMs: null,
    template: name,
    dynamic: false,
    fellBack: false,
    ok: r.ok,
    reason: r.ok ? null : (r.reason ?? "Rejected by Meta"),
    toMasked: maskNumber(to),
    messageId: r.messageId ?? null,
    apiMs: r.apiMs,
  });
  return r.ok ? { ok: true } : { ok: false, reason: r.reason };
}

// Admin test send: fires exactly what a real lead would fire — the dynamic
// deep-link template when it's on, the static one otherwise — and reports
// Meta's verdict plus WHICH template went, so the admin screen says what was
// actually proven. Unlike the real alert this does NOT fall back on failure:
// the test exists to prove the dynamic template works, and a silent
// downgrade would report success while the thing being tested is broken.
//
// The button carries the placeholder id "testlead" — /l/testlead passes the
// id check, and the leads page ignores an unknown id, so tapping it walks the
// real journey (in-app browser -> sign in -> leads) without a real lead.
export async function sendWhatsAppTest(
  toMobile: string
): Promise<{ ok: boolean; reason?: string; template?: string; dynamic?: boolean }> {
  if (!whatsappConfigured()) return { ok: false, reason: "not_configured" };
  const to = toE164(toMobile);
  if (!to) return { ok: false, reason: "bad_number" };

  const dyn = dynamicTemplate();
  const name = dyn ?? (process.env.WHATSAPP_TEMPLATE ?? "new_lead");
  const r = await postTemplate(
    to,
    name,
    leadComponents("there", "Portal Test Lead", dyn ? "testlead" : undefined)
  );
  await recordWhatsApp({
    kind: "test",
    userId: null,
    agentName: "Admin test",
    brandId: null,
    leadId: null,
    leadName: "Portal Test Lead",
    leadReceivedAt: null,
    latencyMs: null,
    template: name,
    dynamic: !!dyn,
    fellBack: false,
    ok: r.ok,
    reason: r.ok ? null : (r.reason ?? "Rejected by Meta"),
    toMasked: maskNumber(to),
    messageId: r.messageId ?? null,
    apiMs: r.apiMs,
  });
  return { ok: r.ok, reason: r.reason, template: name, dynamic: !!dyn };
}
