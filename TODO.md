# Platform backlog

The running list of what needs doing before the platform rolls out to the whole
Experts Group (~200–300 people). No strict order — tick things off as they land.
Logged 23 Jul 2026.

## 1. Referrals-first accounts for everyone 🔶 in progress
Everyone in the group gets an account with referrals as the baseline; Paid Ads
is an optional add-on. The referrals experience has to work perfectly on its
own, and a referrals-only account must have the paid-ads areas fully blocked
off.
- ✅ (23 Jul) Server-side lockdown: all 12 paid-only API routes (leads + every
  sub-action, my/meta, my/ads, campaign) now 403 for referrals-only accounts
  via `lib/api-guard.ts` — previously only the nav hid them client-side.
  Verified: referral session → 403 `paid_only` on paid APIs, 200 on referrals;
  paid session unaffected.
- ✅ (23 Jul) Referrals-only UX: locked pages (Overview/Leads/All Ads) now
  render the real page blurred behind an "Activate Paid Ads" card (→ Profile
  billing) instead of bouncing away; Referrals bumped to the top of the nav
  and set as the post-login landing for referral accounts. Paid accounts
  unchanged (verified both).
- ✅ (23 Jul) Full referrals QA pass — drove the whole loop across two accounts
  (send → cross-account receive → accept → lead created in receiver's funnel →
  convert syncs referral → mark paid). All happy-path + edge cases pass:
  self-brand block (400), referral-tier accounts can send, decline, double-
  accept creates no duplicate lead, sender can't accept their own (403).
  **Bug fixed**: a referred lead marked LOST by the receiver still showed
  "Accepted" to the referrer (looked like it was still progressing). Added a
  "lost" referral status — the lead's lost/resurface now syncs to the
  referral (lost → "Didn't convert / no fee due"; resurface → back to
  accepted), across the row, pipeline, detail banner and admin.
- ✅ (23 Jul) Account provisioning, the buildable half:
  · One-time **launch import** button on Admin → CRM (super admin only):
    upload a CSV, map columns (first name / last name / email / mobile /
    brand), preview with per-row validation, "are you sure" confirm →
    creates referrals-only accounts with the shared password **TEG2026**.
  · **Forced password reset**: imported accounts carry mustResetPassword —
    first sign-in shows a full-screen "set your password" gate; nothing else
    is usable until they do (new /api/auth/set-password, flag-gated).
  · **Base44 deactivation webhook** at /api/webhooks/base44 (header
    x-webhook-secret = BASE44_WEBHOOK_SECRET env). account.deleted →
    deactivates (sign-in + sessions blocked, record kept); account.restored →
    reactivates. All verified end-to-end locally.
- ⬜ Provisioning, still to do:
  · Invite emails (blocked on item 3 — the leads@ mailbox): send each person
    the referral link + starter password once email is live.
  · The "expedited" landing page for the referral link — for now imported
    people just use /login; a nicer welcome route can prefill/brand the flow.
  · Base44 side: create the webhook pointing at
    launchpad.theexpertsgroup.co.uk/api/webhooks/base44, agree the payload
    ({event:"account.deleted", email}) and set the shared secret
    (BASE44_WEBHOOK_SECRET) in Railway + Base44.
  · James to produce the real staff list CSV.
  · Decide: should Base44 also CREATE accounts (new starters) via webhook?

## 2. Maps API broken on referrals ✅ DONE (23 Jul — James added the domain to the key)
Root cause CONFIRMED: the portal moved to the new domain
`launchpad.theexpertsgroup.co.uk`, and the Google Maps browser key's
HTTP-referrer allowlist doesn't include it — Google returns
`RefererNotAllowedMapError` ("Sorry! Something went wrong" grey map).
The old `teg-paid-ads-platform-production.up.railway.app` domain still works.
FIX (Google Cloud Console → APIs & Services → Credentials → the Maps key →
Website restrictions): add `https://launchpad.theexpertsgroup.co.uk/*`
(keep the railway entry; add `http://localhost:3000/*` for local dev too).
Takes effect within ~5 minutes of saving. Key also re-added to local
`.env.local` on 23 Jul.

## 3. Email sending (leads@theexpertsgroup.co.uk) 🔶 in progress
- ✅ (28 Jul) The connection itself. Super admin → Connections → "System
  mailbox (leads@)" → Connect with Microsoft. Stored globally in
  `system_mailbox` (one row), NOT against a user — deliberately separate from
  the per-agent connection, which exists so lead emails come from the agent's
  own address. Those two must never share a token.
  · Reuses the existing Microsoft callback, branching on a nonce cookie, so
    only ONE redirect URI is registered in Azure.
  · Super-admin only: an MD must not be able to repoint the address the whole
    platform sends from.
  · `lib/mailer.ts` → sendSystemEmail(). Reports rather than throws, so a
    signup can never fail because a notification couldn't go out. A revoked
    grant self-disconnects, so the admin sees "not connected" instead of every
    send failing silently.
- ⬜ James: create the leads@ mailbox, then connect it in Admin → Connections.
  Needs AZURE_CLIENT_ID / AZURE_CLIENT_SECRET set (they aren't, locally).
- ✅ (28 Jul) All three senders built:
  · New signup → Hayley (SIGNUP_NOTIFY_EMAIL overrides). Deep-links to that
    customer's record. Fired without awaiting — a signup must never fail or
    slow down because a notification couldn't go out.
  · Forgot password → one-time link, 2h expiry, lands on /reset/[token].
    Always returns the same response whether or not the account exists, so it
    can't be used to enumerate who works here.
  · Invites → POST /api/admin/send-invites for bulk-imported accounts still
    holding the shared launch password. 14-day links, sent sequentially (a few
    hundred parallel Graph calls would throttle), and reports per recipient.
  · Tokens are stored as SHA-256 only, single-use, purpose-scoped, and
    issuing a new one kills the previous one of the same kind.
- ⬜ NOT YET EXERCISED END TO END — needs the mailbox connected. Nothing has
  actually been delivered to an inbox; the routes are verified but the send
  path is unproven.

Stand up a system mailbox that sends:
- Admin notifications — e.g. email Hayley when someone signs up for paid leads.
- "Forgot your password" — reset link flow driven from that mailbox (a request
  queue already exists in lib/password-requests.ts; wire it to real email).
- Payment receipts when someone pays for ads.
- Whatever else needs notifying as features land (referral received, etc.).

## 4. GHL nurture campaigns + lead recycling ⬜
Where a lead goes after the portal, and how it comes back:
- Lead pushed to GoHighLevel must land in a brand-specific nurture campaign.
- Marking a lead LOST on the portal → push that status + all notes into GHL.
- A lead coming back in from GHL → resurface it on the portal (recycled, not
  duplicated) — always either in a nurture campaign or back with the agent.
- Marking a lead WON → cancel its GHL nurture campaign.

## 5. Deactivated accounts — where do the leads go? ⬜
Someone pays on the 1st, leaves the business on the 5th — the ads keep
running and leads keep arriving against a deactivated account. Need a
per-brand fallback address (MD or whoever handles incoming leads) that
catches those leads so nothing is missed. Think through the full logistics.

## 6. Brand-aware "closest agent" matching ✅ (23 Jul) + bug fix
Probed the Team Hub (Base44). Confirmed the split from the real data:
Property (66/73) & Lettings (22/24) carry territory postcodes; Fine & Country
(81/81) carry a location_id → a Location (office) that holds postcodes; the
Recruitment brand has NEITHER populated.
Built:
- Property/Lettings → rank by their territory outward codes (as intended).
- Fine & Country → rank by the partner's Location office: full office postcode
  first, else the centroid of the office's district codes; display shows the
  office name. Verified: near KT13, Weybridge office 0mi → Guildford 10mi.
- **Bug fix**: territory_postcodes / Location postcodes come back as
  {code, level} OBJECTS, not strings. The old code cast them to string[] and
  crashed in `isOutcode` (s.trim), which the route swallowed and fell back to
  portal users — so Property/Lettings matching was silently broken in
  production (Team Hub never actually used). Now flattened to code strings.
- ⬜ Recruitment: no territory or location data in Base44 yet, so its partners
  can't be distance-ranked — they list unranked ("their patch") until someone
  populates location_id (or territory) on TRE TeamMembers in the Team Hub.

## 7. Stripe 🔶 in progress
Account exists — wire it in: taking payment for packages/ad spend, and the
receipt emails from item 3.
- ✅ (27 Jul) Signup checkout, end to end in code:
  · Subscription is TWO line items — a flat £100 management price shared by
    every package, plus one ad-spend price per tier (£150/£300/£450). Invoices
    then show the split the site promises, and a tier change swaps one line.
  · `scripts/stripe-setup.mjs` creates the products/prices and prints the env
    lines. Re-runnable — it reuses anything with a matching lookup key.
  · `/api/checkout` creates a hosted Checkout Session (SCA/3-D Secure and
    receipts are Stripe's problem, not ours); `/api/webhooks/stripe` is the
    ONLY thing that sets `paid`.
  · Signup no longer grants paid access itself — EXCEPT when Stripe is
    unconfigured, where it keeps the old demo behaviour so adding the keys is
    what switches billing on, rather than a deploy locking everyone out.
  · Users gained stripe_customer_id / stripe_subscription_id /
    subscription_status / commitment_ends_at. past_due deliberately keeps the
    portal open while Stripe retries.
- ✅ (27 Jul) Local: keys in, products created, test card driven end to end.
- ✅ (27 Jul) Production (Railway, TEST keys): all six vars set and verified —
  endpoint registered with the right four events, env loaded, forged
  signatures rejected, both payment routes auth-guarded, and a real
  Stripe-signed delivery came back 200 (1 delivered / 0 failed).
  NOTE: the dashboard endpoint's signing secret is NOT the one `stripe listen`
  prints — that catches people out. Going live needs BOTH a new endpoint
  (no /test/ in the URL) and fresh price ids, since test prices don't work
  with a live key.
- ✅ (27 Jul) Signup checkout driven end to end on localhost with a test card
  — session → Stripe → webhook → account flips to paid. Plus a "Payment made"
  confirmation screen before the last signup step.
- ✅ (27 Jul) Closed the free-upgrade hole: /api/auth/upgrade used to set
  paid:true directly, so anyone holding a free referrals account could POST
  to it and unlock the paid portal for nothing — about to be handed to a few
  hundred people. It now starts a Checkout Session and grants nothing;
  verified by attempting the attack (403 on paid APIs afterwards, account
  still referral/unpaid). Checkout-session creation is shared between signup
  and upgrade so the two can't drift.
- ✅ (27 Jul) Billing Portal wired: /api/billing-portal hands off to Stripe's
  hosted screens for card changes, invoices/receipts and cancellation, so we
  never touch card details and don't rebuild an invoice list. Anything changed
  there returns as a subscription webhook, so `paid` still has exactly one
  owner. Needs enabling once in Stripe → Settings → Billing → Customer portal.
- ✅ (27 Jul) 3-month minimum now ENFORCED, not just recorded: commitment_ends_at
  is read on the profile and the cancel flow is replaced with an explanation
  while inside the term.
- ✅ (27 Jul) In-app cancel now actually cancels: sets cancel_at_period_end on
  the real subscription instead of only flagging the account (before this, a
  cancelled customer kept being charged until someone did it by hand). The
  3-month minimum is enforced server-side in the route, not just hidden in the
  UI. renews_at is now read from Stripe, so the profile shows the REAL renewal
  date rather than guessing a monthly anniversary of the signup date, and the
  profile tells the agent the exact date they can cancel from.
- ✅ (27 Jul) /terms and /privacy pages added and linked from the footer
  (which previously showed both as plain text, no pages behind them). Stripe
  requires both URLs before the customer portal can be activated.
  ⚠️ DRAFTS — not reviewed by a solicitor. 22 passages are flagged in-page as
  needing a decision, the big ones being: the contracting entity, VAT and
  whether ad spend is marked up, retention periods, controller vs processor
  for lead data, the lawful basis for nurture messages, the liability cap, and
  the Railway hosting region.
- ✅ (28 Jul) App owns the customer portal config. Stripe's auto-created
  default had cancellation ENABLED and no terms/privacy URLs, which made the
  3-month minimum unenforceable via the portal. Two configs now, chosen per
  customer: no cancellation inside the term, cancel-at-period-end after.
- ✅ (28 Jul) Grow page change-package is live (last Stripe placeholder).
  Swaps only the ad-spend line with proration_behavior "none", so the new
  rate lands on the next invoice — the pack promises "adjust at any renewal",
  not an immediate top-up. Finds the ad-spend item by elimination rather than
  position, since swapping the management fee by mistake would be expensive.
  Verified against a real test subscription: Starter -> Accelerate moved
  £150 -> £450, management untouched at £100, next invoice £550, nothing
  charged on the day.
- ⬜ Live keys + the production webhook endpoint (its signing secret differs
  from the CLI one).

## 8. Rex embed ⬜
Rex can embed a site. Work out the logistics: how sign-in works inside the
embed, what the experience looks like, what needs changing.

## 9. Mobile view 🔶 in progress (mobile-only; desktop untouched, verified)
Approach: everything below the `lg` breakpoint (<1024px) is the mobile layer;
desktop (≥1024px) renders byte-identically (existing markup scoped with `lg:`).
- ✅ (23 Jul) Sign-in: mobile welcome intro ("Welcome to The Experts Group" +
  "Get started", clean light gradient) that folds up to reveal the form.
  Hierarchy per spec: Keep-me-signed-in on its own line under the button;
  "Choose a package" left, "Forgot password" right. Desktop login unchanged.
- ✅ (23 Jul) Mobile loading splash — "The Experts Group / Loading …" with
  animated dots, centred (components/MobileLoading.tsx).
- ✅ (23 Jul) Dashboard shell rebuilt for mobile: side nav dropped; bottom nav
  with Overview · Leads · Referrals · All Ads (locked tabs show a padlock,
  still open the Activate-Paid-Ads overlay); top bar = search icon (left) +
  page title + three-dots menu (right) → Notifications / Help / Profile;
  floating Help launcher hidden on mobile, opened from the menu instead;
  full-screen mobile search sheet + notifications sheet. Desktop chrome
  (sidebar, header, help button) fully preserved — verified at 1280px.
- ✅ (23 Jul) Mobile login v2 + shell polish: swirling brushed-chrome welcome
  (no icon), sign-in slides up as a bottom-sheet "pop-up footer" over the
  swirl (no keyboard auto-open); bottom nav is now solid + pinned to the
  *visual* viewport (visualViewport API) so Chrome's bottom URL bar can't
  cover it; three-dots menu gained a Log out item; killed all horizontal
  "play" (overflow-x hidden <lg); viewport-fit=cover added. Desktop verified
  unchanged.
- 🔶 Inner-page mobile pass — in progress:
  · ✅ (23 Jul) Overview: stats drop icons + shrink so they don't spill off
    the right; "Connect email" is a slim toast (not the big banner); Current
    ad hidden; Uncontacted is the first tile; glaze tiles are content-height
    (not full-screen squares) so far less scrolling.
  · ✅ (23 Jul) Lead modal on mobile: opens as the bottom sheet; decluttered
    to ~one page via a "More details" toggle (hides phone/email/location/
    enquiry/activity by default); Email button becomes a **WhatsApp** button
    (opens wa.me directly); background scroll locked so only the sheet moves
    (no more "freak out"); fixed a horizontal-overflow bug (grid-cols-1).
  · ✅ (23 Jul) Global mobile smoothness: inputs pinned to 16px so focusing a
    field no longer zooms/janks the page.
  · ✅ (24 Jul) Lead sheet v2: slides up leaving a top gap; a fixed candidate
    action bar (Call · WhatsApp · Email · Schedule · Log) replaces the nav
    while open (sheet is z-[100] above it); in-sheet Get-in-touch buttons
    removed; Notes made bigger and moved above Mark-as-lost; body scroll
    locked so only the sheet moves.
  · ✅ (24 Jul) Nav redesign: "broken glass" bottom nav — a frosted pill
    (Overview/Leads/Referrals) + a separate frosted "+" circle whose menu holds
    All Ads/Help/Profile/Log out; top bar is now transparent (title + short
    accent underline), notifications bell top-right, three-dots removed.
  · ✅ (24 Jul) Overview mobile polish: greeting given top room; bento gaps
    tightened; Leads-per-week given real height + bigger numbers; stats already
    icon-free.
  · ✅ (24 Jul) Two bugs fixed: the onboarding tile could strand itself
    invisible-but-space-occupying (its slide-away waited on a transform
    transitionend that never fired) → "massive gap"; and 10 stacked
    backdrop-blur layers made content behind them (the onboarding card) fail to
    paint → blur now desktop-only on the glaze tiles.
  · ✅ (24 Jul) Overview mobile re-imagined: Uncontacted is now a "Tinder for
    leads" swipe stack (components/LeadSwipeStack.tsx) — swipe right to open the
    file, left to resurface tomorrow, up to two cards peeking behind, counts
    down to "All caught up". Leads-per-week + Ad spend are two square tiles side
    by side (this-week count + % up/down vs last week). The four totals
    (Impressions/Clicks/Leads/Converted) are square stat tiles. Desktop keeps
    the original bento + header stats (both scoped desktop-only).
  · ✅ (24 Jul) Performance fix + nav polish. The mobile site had slowed to a
    crawl (clicks not registering, everything janky): the `useBottomInset`
    hook added a `visualViewport` *scroll* listener that fired every scroll
    frame — because mobile Chrome animates its URL bar on scroll, the viewport
    height changed each frame → `setInset` re-rendered the whole dashboard
    layout (and any open lead modal) ~60×/sec, saturating the main thread.
    Removed the hook entirely (nav now just `fixed bottom-0`), and dropped the
    `backdrop-blur-xl` on the nav pill/circle/menu (near-solid white instead)
    so it no longer repaints the page on every scroll frame. Scrolling +
    tapping verified smooth again. Alongside: All Ads moved into the bottom
    pill (Overview/Leads/Referrals/All Ads), so the "+" menu is now just
    Help/Profile/Log out; the top bar is back in normal flow (scrolls away
    with the page instead of floating transparently over content); and opening
    a lead makes the bottom nav *morph* (collapse + re-expand) into that lead's
    Call/Email/WhatsApp/Schedule — the sheet sits below the nav (z-80 vs 90),
    tapping the dimmed backdrop closes it, and "Log contact attempt" now lives
    on the page (in the sheet body) rather than in the nav.
  · ✅ (24 Jul) Building ON the PWA (standalone mode removes the browser
    chrome, so there's no bottom bar to fight — the visualViewport gymnastics
    stay gone):
    - Install gate now only guards the APP (/login, /dashboard, /admin). The
      public marketing site (/, /signup) is freely browsable in a phone
      browser; the "install LaunchPad" prompt only appears when they head to
      sign in. (components/InstallGate.tsx, usePathname gate.)
    - Bottom nav: bigger (taller pill, h-6 icons, bigger + circle), sits
      closer to the bottom (pb reduced to safe-area+7px so it contours to the
      phone), and is glassier — frosted bg-white/55 + backdrop-blur, not the
      milky near-solid it was.
    - Overview mobile re-imagined against a reference (BizLink): scrapped the
      Tinder swipe stack. Top is now a 2×2 tile grid — Uncontacted (accent
      tile, taps to the first one) · Follow-ups · This week (±% vs last week) ·
      Ad spend — over a "Leads this week" bar graph (per-day bars, today in the
      brand colour) and the four headline stat squares. (app/dashboard/page.tsx)
  · ✅ (24 Jul) Overview + nav polish pass 2 (against the BizLink reference):
    tiles now read number-above-label pinned to the bottom with the pill in
    the top-right (bigger number); top bar gained safe-area-inset-top padding
    so the search/bell clear the iPhone status bar in standalone; bottom nav
    turned dark (reference charcoal #26262b), icons-only (labels dropped,
    icons bigger), wider with internal edge padding so it's not squished. The
    open-lead nav morph is dark to match (keeps its Call/Email/WhatsApp/
    Schedule labels).
  · ✅ (24 Jul) Overview + nav pass 3 (from a real-iPhone screenshot):
    - "Leads this week" bar graph moved above the This-week / Ad-spend row.
    - Ad spend is now a pie — spent as a solid brand wedge, remaining as
      hatched grey (SpendPie in page.tsx).
    - Tapping Uncontacted / Follow-ups now slides up a bottom sheet listing
      ALL those leads (each row opens the full file), instead of jumping
      straight to the first one.
    - The "+" overflow menu bubbles up out of the plus button (bubble-up
      keyframe) — slower and more obviously animated.
    - Bottom nav made bigger again (h-30 icons, 66px + circle) and dropped
      closer to the bottom: pb is now safe-area/2 + 8px (was reserving the
      full safe-area inset, which left a big dead gap under it in standalone).
  · ✅ (24 Jul) PWA-feel + overview pass 4:
    - Stay-signed-in: the session cookie is now always persistent (maxAge =
      the token's 30-day life) instead of dropping to a session cookie when
      "remember me" was off — so the installed app no longer makes you log in
      every launch. Natural ~monthly re-login when the token expires.
    - The app opens into itself, not the website: manifest start_url is now
      /dashboard (→ overview if signed in, else /login), and a StandaloneGuard
      redirects the marketing page into the app if it's ever hit in standalone.
      The public site only shows in a real browser.
    - Bar-graph bug fixed: "Leads this week" bucketed by Mon–Sun calendar week
      while "This week" counts a rolling 7 days, so recent leads before Monday
      showed in the number but not the bars. Both now use the identical rolling
      7-day window, so the graph total always equals the This-week count.
    - Pull-to-refresh (components/PullToRefresh.tsx): drag down from the top to
      reveal a spinner and re-check leads/referrals/notifications (fires a
      teg:refresh the page listens for). Disabled while a sheet/modal is open.
    - Bigger search + notification icons in the top bar.
  · ✅ (24 Jul) Launch Pad branding: loading splash rebuilt as the "Launch Pad"
    lockup (Experts Group pin + stacked, tight-tracked wordmark on a frosted
    wash) instead of "The Experts Group / Loading"; app name changed from "LP"
    to "Launch Pad" (manifest short_name + appleWebApp title + applicationName);
    home-screen icons (apple-touch-icon / icon-192 / icon-512) regenerated as
    the pin glyph centred on a TRANSPARENT square (via a sharp script from the
    existing alpha pin) for the iOS glass/clear-mode look. Placeholder until the
    proper icon is designed. NB: iOS caches home-screen icons — remove & re-add
    the icon to see the new one.
  · ✅ (24 Jul) Nav + list polish pass 5:
    - Uncontacted / Follow-ups list sheet now sits ABOVE the nav (z-95) with a
      white gradient bar across the bottom, so the dark nav no longer cuts the
      rows — names slide up from under the white bar.
    - Lead-action nav is icons-only now (dropped Call/Email/WhatsApp/Schedule
      labels), evenly padded with more room at the ends, and the WhatsApp glyph
      bumped up so all four read the same size.
    - Nav morph animation: the bar now pinches shut to the centre, swaps its
      buttons while hidden, then re-opens from the middle outwards (a scaleX
      collapse/expand state machine) — same on open and close.
    - Nav tucks away (slides down) whenever the notes field is focused / the
      keyboard is up, via teg:nav-hide / teg:nav-show events; comes back on
      blur or when the sheet closes.
  · ✅ (24 Jul) Big polish pass 6:
    - Overview animates on load: the tile numbers count up, the bar-graph bars
      grow up from the baseline (staggered), and the ad-spend pie fills from
      empty (useCountUp hook + bar-grow keyframe + animated SpendPie fraction).
    - Lead file is swipe-to-dismiss: a grab handle at the top; drag down past a
      threshold and it slides off and closes (the dimmed backdrop keeps the
      page behind perfectly still). No more forced X.
    - Bottom nav redesigned to the reference: dark, edge-to-edge, equal-width
      44px+ targets, with a lighter "surround" that SLIDES to the active tab
      (flows between them). The separate "+" circle is gone.
    - Overflow moved to a top-right three-dots button (dark, matches the nav):
      tap it and it unrolls left into notifications / help / profile / log out
      (icons only). Replaces the bell + the old bottom "+" menu; closes on
      navigate / tap-away.
    - The bottom bar still morphs (pinch-to-centre) into a lead's actions when
      a file opens — the "context-aware" behaviour.
  · ✅ (24 Jul) Lead-file + nav pass 7:
    - Brought the "+" bubble back next to the 4-icon pill (with the sliding
      surround); it opens a quick-actions menu (Help / Profile / Log out).
      NB: overlaps the top-right three-dots — pending a unique per-screen role.
    - Lead file opens as a FULL window (h-dvh) instead of an 85dvh sheet, with
      the swipe-down grab handle + safe-area top. Keeps the slide-up animation.
    - Mobile lead body re-ordered via flexbox `order` (no DOM move, desktop
      untouched): the inquiry sits front-and-centre with NO box + the time it
      came in small underneath → Log Attempt → Notes → More details (moved
      below Notes).
    - Killed the duplicate Log Attempt: the "Next step — reach out to X" card
      is desktop-only now; mobile keeps the single standalone Log button.
    - Schedule/Calendar is its own bottom sheet: X (cancel) top-left and a
      brand-colour tick (save) top-right sit OUTSIDE on the blurred backdrop;
      the calendar sits directly on the sheet (no box-in-a-box), bigger, with
      the time slider. Nav tucks away while it's open.
  · ✅ (24 Jul) Nav rearrangement pass 8:
    - Top bar: the page title ("Overview") moved to the LEFT (search icon
      dropped from there); the three-dots overflow on the right got bigger and
      now holds just Help / Profile / Log out (bigger, matching icons) — it
      unrolls left as before.
    - Top-right bubble: three-dots + notifications bell (red unread badge)
      together; tapping the dots unrolls help/profile/log out to the left while
      the bell stays as the right endcap.
    - Bottom-right: a single search circle (replaced the old "+"), sized to
      match the nav pill height (items-stretch + aspect-square).
    - NB still pending: the bottom "+" slot is search on every screen for now;
      true per-screen morphing (a different action per page) is the
      outstanding "active button" idea.
  · ✅ (24 Jul) Glass + physics + search interaction pass 9:
    - Nav bar is now dark GLASS: rgba(28,28,32,0.68) + backdrop-blur/saturate,
      with an inset top-highlight and bottom-shade for lit depth (not flat) —
      the "milky dark, best of both worlds" look from the reference card.
    - Elasticity: sheets/footers pop up with a spring overshoot (modal-pop +
      sheet-up use bouncy easings); the search circle springs back on release.
    - Mobile search reworked: tapping the search circle expands a dark-glass
      bar across the bottom over the nav (search-pop, grows from the right);
      tapping the field slides it up ~halfway with a white results sheet above
      (room for the keyboard) and live results; tap the dimmed backdrop to
      bounce back. Replaced the old full-screen search sheet.
  · ✅ (24 Jul) Lead file + card pass 10:
    - Nav bar's selected icon is now WHITE (was the brand accent, hard to read
      on the dark glass).
    - Lead file (mobile): removed the swipe-down grab bar; X sits top-right and
      everything is bumped below it; the source icon has no box, is bigger and
      sized to the three text lines (name / received-via / date) grouped
      left-aligned. Dropped the big "visual text" inquiry. Address is open at
      the top (type straight in). "Log attempt" and "Add note" are now
      left-aligned auto-width buttons with a 3D inset-shadow look. Desktop
      modal unchanged (mobile/desktop headers split).
    - Lead cards: bigger source icon (no box), open-file chevron on the right;
      already full-width + click-anywhere.
  · ✅ (24 Jul) Leads mobile Filters: consolidated the sprawling chip row into a
    single "Filters" button → bouncy bottom sheet with Show (New only / This
    week / Last 30 days / All time / Check Atlas), Stage (All / New / Attempt
    1-3 / Booked — new stageFilter), and Sort by (Newest / Oldest / Not
    contacted). Reset + "Show N leads" apply; an active-filter dot on the
    button. Defaults stay newest-this-week-first. Desktop keeps its full chip
    row + Sort (state shared).
  · ⬜ Leads list still to do: the exaggerated "card expands to fill the screen"
    open animation (shared-element / FLIP).
  · ⬜ Still to do: Leads funnel/board page polish, Profile, admin on mobile.
  · ⬜ Real-iPhone check: Microsoft login *inside* the installed PWA is the one
    path not yet tested on a real device (flagged by the PWA build session).
  Desktop verified unchanged throughout.

## 10. Micro-site data from base44 (later) ⬜
Micro-site capture removed from the portal UI (Jul 2026). Eventually pull the
micro-site URL per agent from the base44 website's database instead. The
`micrositeUrl` field still exists in the portal DB/API for when that lands.
