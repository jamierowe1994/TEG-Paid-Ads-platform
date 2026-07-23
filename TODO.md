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
- ⬜ Full referrals-experience QA pass (the flow itself working perfectly).
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

## 3. Email sending (leads@theexpertsgroup.co.uk) ⬜
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

## 6. Brand-aware "closest agent" matching ⬜
How referral routing finds the nearest agent differs by brand:
- Property Experts + Lettings Experts → match on **territory postcodes**
  (list to be provided) against the searched address/area.
- Fine & Country + Recruitment Experts → match on **location** instead.

## 7. Stripe ⬜
Account exists — wire it in: taking payment for packages/ad spend, and the
receipt emails from item 3.

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
- ⬜ Still to do: responsive pass on the inner pages themselves (Overview
  tiles, Leads funnel/board, lead modal, Profile, admin) — the shell is
  mobile now but individual page content still needs tightening for phones.
  Deferred deliberately (mobile + Rex embed will evolve with the platform).

## 10. Micro-site data from base44 (later) ⬜
Micro-site capture removed from the portal UI (Jul 2026). Eventually pull the
micro-site URL per agent from the base44 website's database instead. The
`micrositeUrl` field still exists in the portal DB/API for when that lands.
