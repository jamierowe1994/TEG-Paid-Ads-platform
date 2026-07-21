// Copy for the Help Centre and the idle "nudge" tips that pop out of its
// button. Everything customer-facing lives here so it's easy to tweak the
// wording, add a new recorded call, or write another how-to without touching
// the component.

export interface Nudge {
  id: string;
  icon: string;
  text: string;
}

// Short, punchy prompts that pop out of the Help button when it's idle. Every
// one points the agent back at their leads — speed-to-lead facts, not fluff.
// Keep them to a sentence or two.
export const NUDGES: Nudge[] = [
  {
    id: "speed-30",
    icon: "⚡",
    text: "Call a new lead within the first 30 minutes and you're up to 50% more likely to book an appointment.",
  },
  {
    id: "speed-5",
    icon: "⏱️",
    text: "The first 5 minutes matter most — leads called straight away are far more likely to pick up.",
  },
  {
    id: "persistence",
    icon: "📞",
    text: "It usually takes 3–4 attempts to reach a lead. Most people stop after one — don't be most people.",
  },
  {
    id: "warm",
    icon: "🔥",
    text: "A “not yet” isn't a no. Keep them warm and they'll come back to you ready to talk.",
  },
  {
    id: "followup",
    icon: "🔁",
    text: "Got leads due in your Follow-ups today? A quick call now beats a cold one next week.",
  },
  {
    id: "morning",
    icon: "☀️",
    text: "Leads that land overnight are hottest first thing — start your day in the funnel.",
  },
  {
    id: "speed-lead-again",
    icon: "🏃",
    text: "Every hour you wait to call, the chance of reaching a lead drops. Speed is the whole game.",
  },
];

export type ArticleKind = "how" | "why" | "call";

export interface HelpArticle {
  id: string;
  title: string;
  kind: ArticleKind;
  // One-line teaser shown in the list.
  summary: string;
  // Body: plain text. Blank lines separate paragraphs; lines starting with
  // "- " render as bullets. Kept simple on purpose.
  body: string;
  minutes?: number; // read/watch time
}

export const KIND_LABEL: Record<ArticleKind, string> = {
  how: "How-to",
  why: "Why it matters",
  call: "Our calls",
};

// The articles. "how" = step-by-step, "why" = the case for doing it, "call" =
// a recorded team call / update (placeholder bodies until the videos land).
export const ARTICLES: HelpArticle[] = [
  {
    id: "speed-to-lead",
    title: "Why speed to lead wins",
    kind: "why",
    minutes: 3,
    summary: "The single biggest lever on your conversion rate is how fast you call.",
    body: `Speed to lead is the amount of time between a lead landing in your funnel and you making first contact. It's the biggest thing you control — and it moves your numbers more than anything else.

The pattern is consistent across every industry:

- Call within 5 minutes and you're dramatically more likely to actually reach the person.
- Call within 30 minutes and you're up to 50% more likely to book an appointment.
- Wait an hour or more and the odds fall off a cliff — the lead has moved on, or someone else got there first.

Why? A lead who's just filled in a form is sitting there, phone in hand, thinking about you. An hour later they're back at work, at the school run, or talking to your competitor.

The takeaway: when a new lead pings, treat it as the most important thing on your desk. Everything else can wait ten minutes.`,
  },
  {
    id: "keep-warm",
    title: "Keep Warm: bringing a lead back later",
    kind: "how",
    minutes: 2,
    summary: "When it's a “not yet”, don't lose the lead — keep it warm and it comes back on its own.",
    body: `Not every lead is ready today. When someone says "not right now, maybe in a few months", that's not a loss — it's a timing issue. Keep Warm handles it for you.

How to keep a lead warm:

- Open the lead and tap Mark as lost.
- Choose a timing reason — "Not the right time", "Just thinking about it", or "Budget / price".
- On the next screen, pick when they said they'd be ready: 1, 3, 6 or 12 months, or an exact date.

That's it. The lead is filed away so it's not cluttering your active funnel, and on the day you chose it comes back as a fresh new lead — with a notification prompting you to call. You'll see a 🔥 Warm badge on any lead that's resting, so you always know it's coming back.

You can also bring a warm lead back early — open it and tap "Bring back now".`,
  },
  {
    id: "lead-funnel",
    title: "How the lead funnel works",
    kind: "how",
    minutes: 3,
    summary: "New → Attempts → Converted → CRM. Each stage shows you the next best action.",
    body: `Every lead moves through a simple funnel, and the portal only ever shows you the one action that makes sense next.

- New — just landed. Call it. Fast.
- Attempt 1, 2, 3 — each time you try and don't get through, log the attempt. The lead then rests until tomorrow and pops back into your Follow-ups, so you're not chasing it all day.
- No answer after three tries — send it to the marketing funnel, where our automated follow-ups keep it warm.
- Converted — you've booked the appointment. Nice one.
- In your CRM — you've pushed the lead across; it's now with your CRM.

Two side paths keep leads out of the bin: Keep Warm (for a "not yet") and Follow up on a day (rest a lead until a date you pick, without changing its stage).`,
  },
  {
    id: "book-appointment",
    title: "Booking and rearranging appointments",
    kind: "how",
    minutes: 1,
    summary: "Book a call or viewing straight from the lead, and rearrange in a couple of taps.",
    body: `To book an appointment:

- Open the lead and tap Call, then the "Schedule a call" tab (or the main booking button).
- Pick a date on the calendar, then a time.
- Tap "Book it in".

The lead moves to Converted and you'll see the booking confirmed at the top. To move it, open the lead again and tap "Rearrange" — pick a new slot, or cancel the booking entirely.`,
  },
  {
    id: "email-lead",
    title: "Emailing a lead (and saving templates)",
    kind: "how",
    minutes: 2,
    summary: "Send from your own mailbox, and save your best messages as reusable templates.",
    body: `Open a lead and tap Email. You'll get a few ready-made templates — first touch, chasing a reply, confirming an appointment — that fill in the lead's name automatically.

Once you've connected your mailbox (Profile → Email sending), emails send straight from your own account and land in your Sent items. Until then, the portal prepares the draft for you.

Written a message you'll want again? Tap "Save as a template" and give it a name. Next time it's one click, personalised to whoever you're emailing.`,
  },
  {
    id: "referrals",
    title: "Passing a referral to another Experts Group business",
    kind: "how",
    minutes: 2,
    summary: "Got a lead that's not for you? Pass it across the group and earn on it.",
    body: `If a lead is really a job for another part of the group — a mortgage, a letting, a commercial deal — you can refer it rather than lose it.

- Go to Referrals and start a new referral, or use the referral option on the lead.
- Pick the business it's for, add a note, and send.
- The receiving agent accepts it and it drops into their funnel. You can watch its progress from your side, and if it converts, the referral fee is yours.

It's the easiest way to make a lead pay off even when it isn't one you can work.`,
  },
  {
    id: "where-is-it",
    title: "Where do I find…? A quick tour",
    kind: "how",
    minutes: 2,
    summary: "Overview, Leads, Referrals, All Ads, Profile — what lives where.",
    body: `Everything hangs off the sidebar on the left:

- Overview — your headline numbers and campaign status.
- Leads — your funnel. New leads, follow-ups, and your lost/archived files (including anything you've kept warm).
- Referrals — leads passed to and from other group businesses.
- All Ads — the ads we're running for you.
- Profile — your details, package, and email connection.

Up top: the search box finds any lead or referral by name, and the bell shows new leads and referrals as they land. Down here in the bottom-right is the Help Centre — that's me.`,
  },
  {
    id: "call-speed",
    title: "Team call: getting to leads faster",
    kind: "call",
    minutes: 12,
    summary: "The team walk through what fast-responding agents do differently.",
    body: `A recorded team session on speed to lead — what the top-performing agents across the group do differently, and the small habits that add up to a much higher conversion rate.

(The recording will play here once it's uploaded. For now, the short version: call new leads immediately, log every attempt, and never let a "not yet" turn into a lost lead — keep it warm.)`,
  },
  {
    id: "call-whats-new",
    title: "What's new on the platform this month",
    kind: "call",
    minutes: 5,
    summary: "A quick run-through of the latest features and improvements.",
    body: `A short update on what's just landed in the portal.

- Keep Warm — bring a "not yet" lead back automatically at 1, 3, 6 or 12 months, or a date you pick.
- This Help Centre — searchable how-tos, our team calls, and speed-to-lead nudges when you need them.

(The full walkthrough video will appear here once it's uploaded.)`,
  },
];
