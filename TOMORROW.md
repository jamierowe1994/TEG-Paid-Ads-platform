# Tomorrow — 28 Jul

Short list for picking back up. The full backlog is in `TODO.md`; this is
just what's live right now.

Where we got to: **Stripe works end to end**, on localhost and on the live
site. Test mode. Signup → pay → account unlocks, and it's proven in
production (real signed webhook delivery, 200, 1 delivered / 0 failed).

---

## 1. Ten minutes, and it unblocks the rest

**Enable the Stripe customer portal.**
Stripe → Settings → Billing → Customer portal.

- Invoice history — **ON**
- Payment methods (update card) — **ON**
- Customer information → email + billing address — **ON**
- Cancel subscriptions — **OFF** (it would bypass the 3-month minimum)
- Switch plans — **OFF** (it changes immediately; we promise "at renewal")
- Terms URL: `https://launchpad.theexpertsgroup.co.uk/terms`
- Privacy URL: `https://launchpad.theexpertsgroup.co.uk/privacy`

Until this is done, "Manage billing" in Profile returns an error. Both
those pages now exist — that was the blocker yesterday.

---

## 2. Needs a person, not a developer

**Get the terms and privacy drafts reviewed.** They're live at `/terms` and
`/privacy` with 22 points flagged in red as needing a decision. The six that
actually matter:

1. **Which legal entity** contracts for this? Stripe says *The Property
   Experts INTL Ltd* — is that right for all seven businesses?
2. **VAT** — do the advertised prices include it? And is ad spend passed
   through at cost or marked up? The site currently says neither.
3. **Controller or processor** for lead data, and is the agent a joint
   controller? This decides what leads must be told at the point they submit
   a form.
4. **Lawful basis for nurture messages** — the ones we send on the agent's
   behalf after the initial enquiry.
5. **Retention** — how long lead data is kept, and what happens when an
   account closes. Nothing is deleted automatically today, so whatever gets
   agreed needs building.
6. **Liability cap** — genuinely one for a solicitor.

Also worth knowing: **the Railway database's hosting region**. The privacy
policy can't say where data lives until someone checks.

---

## 3. Ready for me whenever you are

- **Grow page** — top-ups and package changes are the last Stripe
  placeholder.
- **Going live on Stripe.** Not just swapping the key: needs a *second*
  webhook endpoint (no `/test/` in the URL) **and** fresh price ids, because
  test prices don't work with a live key. Re-running
  `node scripts/stripe-setup.mjs` with the live key does the second half.
- **Retention/deletion**, once item 2.5 is decided.

---

## 4. Still open from before Stripe

Nothing here moved yesterday — listed so it doesn't get lost:

- **Invite emails** — blocked on the `leads@` mailbox (TODO item 3).
- **Base44 webhook** — needs creating on their side, pointing at
  `/api/webhooks/base44`, with the shared secret set both ends.
- **The real staff list CSV** for the launch import.
- **Atlas / REX referral feeds** — "Terms signed" shows *awaiting feed*
  until there's a webhook.
- **Live ads showcase** — still needs either two creative images or a Meta
  API pull.
- **REX/Atlas logos** — done, those are in.

---

## Housekeeping

- The Stripe CLI is at `~/.local/bin/stripe` (already on your PATH). For
  local webhooks: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
- **Homebrew is broken** — your Xcode Command Line Tools are 26.6 and it
  wants 27, and Apple only offers a beta right now. Not urgent, but it'll
  block any future `brew install`.
- `.env.local` has all six Stripe test values. It's gitignored; Railway has
  its own copy with a *different* webhook secret.
