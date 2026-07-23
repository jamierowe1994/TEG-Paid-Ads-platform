import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth";
import { findById } from "@/lib/users-store";
import { brandById } from "@/lib/brands";
import { ARTICLES } from "@/lib/help-content";

// The Help Centre's live Claude agent. Streams answers about how the portal
// works, grounded in the same how-to articles the Help Centre shows — and it
// can "serve" an article to the agent by emitting an [article:id] marker,
// which the client renders as a tappable card that opens the full read.
//
// Uses the Anthropic Messages API directly over fetch (no SDK — matches the
// dependency-free style of lib/rex.ts and lib/microsoft.ts). Needs
// ANTHROPIC_API_KEY in the environment.

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = "claude-opus-4-8";

// Everything the agent knows about the portal. The article bodies double as
// its knowledge base, so updating lib/help-content.ts updates the bot too.
function systemPrompt(firstName: string, brandName: string, crmName: string) {
  const articleList = ARTICLES.map(
    (a) => `<article id="${a.id}" kind="${a.kind}" title="${a.title}">\n${a.body}\n</article>`
  ).join("\n\n");

  return `You are the live Help Centre assistant inside The Experts Group Paid Ads portal — a lead-generation platform where estate agents, recruiters and brokers manage leads that come in from their paid social ads.

You are talking to ${firstName}, an agent at ${brandName} (their CRM is ${crmName}).

The portal, in brief:
- Overview — headline numbers, the Uncontacted and Follow-ups boxes, campaign status and the onboarding tracker.
- Leads — the funnel: New → Attempt 1/2/3 → Converted → pushed to CRM. Side paths: Keep Warm (a "not yet" that comes back later), Follow up on a day, send to the marketing funnel after 3 tries, and archive.
- Referrals — pass a lead to another Experts Group business and earn the referral fee.
- All Ads — the ads being run for them.
- Profile — their details, package, and Microsoft email connection (Profile → Email sending).
- Help Centre — you, in the bottom-right corner.

Your knowledge base — the Help Centre's own articles:

${articleList}

How to answer:
- Be brief, warm and practical. A couple of short sentences or a short list beats an essay. Never invent features the portal doesn't have — if you don't know, say so and suggest they contact the team.
- When one of the articles above answers the question (or is worth a fuller read), include its marker on its own line at the END of your reply: [article:the-id]
  The portal turns that marker into a tappable card that opens the article — so don't also paste the whole article body, just give the short answer plus the card. At most two markers per reply.
- Push speed-to-lead whenever it fits: calling a new lead in the first 30 minutes is up to 50% more likely to book the appointment.`;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function POST(req: NextRequest) {
  const id = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!id) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const user = await findById(id);
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "The assistant isn't configured yet (missing ANTHROPIC_API_KEY)" },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => null);
  const history: ChatMessage[] = Array.isArray(body?.messages) ? body.messages : [];
  // Keep the conversation bounded — the last 20 turns is plenty of context.
  const messages = history
    .filter(
      (m) =>
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim()
    )
    .slice(-20)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return NextResponse.json({ error: "No question to answer" }, { status: 400 });
  }

  const brand = brandById(user.brandId);
  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      stream: true,
      system: systemPrompt(
        user.name.split(" ")[0],
        brand?.name ?? "The Experts Group",
        brand?.crmName ?? "their CRM"
      ),
      messages,
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const err = await upstream.text().catch(() => "");
    console.error("Help chat: Anthropic error", upstream.status, err.slice(0, 500));
    return NextResponse.json(
      { error: "The assistant is having a moment — please try again" },
      { status: 502 }
    );
  }

  // Re-stream just the text deltas as plain UTF-8 — the client appends chunks
  // straight into the growing assistant bubble.
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const reader = upstream.body.getReader();
  let buffer = "";

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      buffer += decoder.decode(value, { stream: true });
      // SSE events are separated by blank lines; each data: line is JSON.
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";
      for (const evt of events) {
        for (const line of evt.split("\n")) {
          if (!line.startsWith("data:")) continue;
          try {
            const data = JSON.parse(line.slice(5));
            if (
              data.type === "content_block_delta" &&
              data.delta?.type === "text_delta" &&
              typeof data.delta.text === "string"
            ) {
              controller.enqueue(encoder.encode(data.delta.text));
            }
          } catch {
            /* partial or non-JSON line — skip */
          }
        }
      }
    },
    cancel() {
      reader.cancel().catch(() => {});
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
