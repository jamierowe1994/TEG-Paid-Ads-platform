# Launch list

Target: live within ~2 weeks of 3 Aug 2026.

This is the **launch-critical** list — the things that block going live, kept
separate from [TODO.md](TODO.md), which is the longer-running platform backlog.
No strict priority order; each item gets fleshed out as James talks it through.

**How this list is used:** it's the reference point for what needs doing. If
work drifts onto something that isn't on here, check it against this list
first — unless it's something genuinely new that hasn't been captured yet.

Status key: 🔴 not started · 🔶 in progress · ✅ done

---

## 1. Landing page — mobile view 🔴

The landing page has been built and iterated on desktop. It needs a proper
mobile pass, not just "it doesn't break".

- Everything optimised for mobile — the scroll-driven sections (sticky
  stacking, panel curves, the phone reveal, the connection hub) all need
  checking at phone widths, since several were tuned against desktop
  viewport maths.
- **Sign-in on mobile pushes to the mobile app** rather than the web
  dashboard. Decide the exact behaviour: app-store redirect, PWA install
  prompt, or deep link if already installed.

_Detail to be added._

## 2. New signup process 🔴

**Referrals-only at launch.** Paid Ads gets bolstered in afterwards, to buy
enough time to do it properly.

The reasoning: referrals only work if *everyone* is on the platform. A
half-populated directory means referrals can't be routed properly, so getting
the whole group onto accounts is the launch dependency — not paid ads.

- New signup flow built around referrals as the default.
- Everyone in the group on an account from day one.
- Paid Ads added as an upgrade path later.

Related: the Team Hub import (`/api/admin/import-team-hub`) already creates
dormant referral accounts — that's the mechanism for getting everyone on.
Still needs running against production, and the `leads@` mailbox before
invites can go out.

_Detail to be added._

## 3. GoHighLevel — all brands, two-way 🔴

GHL is connected, but only as a one-way push and not for every brand.

**Connect all brands.** Currently partial.

**Make the funnel two-way:**
- Launchpad → GHL: when a lead is set as an appointment on the agent/manager
  side, write a note onto the GHL account.
- GHL → Launchpad: when GHL gets a kickback on someone's lead (e.g. they
  replied to a nurture email), feed that lead back into Launchpad,
  **resurface it** for the agent, and attach the notes so they can see what
  the person actually said.

**Dead deals route correctly.** When a deal is marked dead it needs shifting
into the right nurture segment rather than just stopping — confirm the nurture
side is set up and that we're pushing to the correct section.

_Detail to be added._

## 4. Meta — all brands connected 🔴

Only about half the brands are on Meta at the moment. All of them need to be
on, plumbed in, and verified working.

Known blocker: The Mortgage Experts ad account needs System User access
granted — likely from inside MAB's Business Manager.

_Detail to be added._

## 5. Lead destination — where leads actually land 🔴

Rex is expected to be the big one. Needs working through properly rather than
assumed:

- When we push a lead to Rex, is it going to the **right place**?
- What actually gets **created** out of that push — is it saved as a lead, a
  contact, something else?
- Where does that record then go in their workflow?
- What's the **best** place to put them?
- How much **information** can we carry through with it?

**Rex accounts — checked 3 Aug 2026, and not what was assumed.**

`Accounts/search` with the current API user returns exactly ONE account:
`{ id: 3517, name: "The Property Experts" }`. Railway has only
`REX_ACCOUNT_ID` set — no `REX_ACCOUNT_PROPERTY`, no `REX_ACCOUNT_LETTINGS`.

What that means:
- **TPE is fine.** Every brand falls back to `REX_ACCOUNT_ID`, and for TPE
  that fallback happens to be the correct account.
- **Lettings is NOT fine.** A lettings referral currently looks its landlord
  up in the Property Experts' account. It will mostly return
  `matched: false`, and could in principle match the wrong person.
- All the Rex probing done on 3 Aug — field vocabulary, duplicate counts,
  the end-to-end stage verification — was against TPE's data. Anywhere those
  notes say "the TLE account", read "account 3517 = The Property Experts".
  It also explains why all 60 sampled listings were `residential_sale`.

**Answered (James, 3 Aug):** The Lettings Experts has folded into The
Property Experts — same brand, one Rex account. Lettings work is TLE, sales
work is TPE, but they share account 3517. So **no env change is needed**: the
`REX_ACCOUNT_ID` fallback is correct for both, and `REX_ACCOUNT_PROPERTY` /
`REX_ACCOUNT_LETTINGS` are unnecessary.

**The cross-contamination question is now SETTLED.** ✅ 3 Aug 2026.

With one shared account, a contact could hold both a sale and a rental
listing, and the tracker read every listing and set both brands' flags from
it — so a vendor's sale listing could light up "on market", or even "tenant
found", on a *lettings* referral.

The proposed fix was a `listing_category` filter. It turned out not to be
needed, because the premise was wrong: **lettings does not live in Rex at
all.** 360 sampled listings are all `residential_sale` — there is no rental
stock in the account. So rather than filter, **lettings now reads Propoly and
does not touch Rex**, which removes the false-positive path entirely.

The honest cost of that, recorded so nobody "fixes" it later by accident:
Propoly knows nothing before a tenant is found. Its `properties` endpoint is
an address book — no status, no marketing dates. So for lettings,
"appointment booked" and "on market" have no source in **either** system and
are only inferred backwards once a deal exists. **A landlord who has been
appraised but has no tenant yet shows no progress.** That is under-reporting
by design; the alternative was reporting things that weren't true.

Note: the Rex contact search was broken until 3 Aug 2026 (positional criteria
were rejected, so every lookup failed and each push created a fresh contact).
Fixed in `lib/rex.ts`.

_Detail to be added._

## 6. Referral working + safe Rex push 🔶

The referral shouldn't jump straight from "sent" to "Rex says something
happened". The receiving agent works it in Launch Pad first, exactly the way
leads are worked today, and only then does it reach the CRM.

**The journey**
1. Referral arrives → the receiving agent marks contact attempts, same
   controls as the leads funnel.
2. Marked as contacted → visible to the referrer.
3. Appointment set → recorded in Launch Pad, not Rex.
4. Pushed to Rex → from here the Rex-sourced stages take over (already built
   for lettings and TPE — see `lib/lettings-tracker.ts`).

**Duplicate handling on push — SETTLED.** ✅ Built 3 Aug 2026.

James's overriding rule: **a push is never refused.** Getting the file into
Rex and tracked beats keeping it tidy — a duplicate can be merged in Rex, a
referral that never arrived is lost.

So the check is advisory. `pushLeadToRex` runs
`Dedupe/findPossibleDuplicates` AFTER the push lands and returns
`possibleDuplicateIds` + `duplicateCheckFailed`; the push route spreads both
through to the client. See `lib/rex-dupes.ts`.

Rex does the matching, so we inherit its own de-duplication rather than
reinventing address comparison ("12 High St" / "12 High Street" /
"Flat 2, 12 High St") — the part that fails quietly. A failed check reports
`duplicateCheckFailed` rather than "none found", so an outage can't read as a
clean bill of health.

This REVERSES an earlier plan to refuse partial matches. Making it blocking
again is a product decision, not a tidy-up.

**Still to build — the working stages before Rex.** Steps 1–3 of the journey
above don't exist yet. A referral has no working state of its own: today
`Referral.stage` mirrors a linked lead rather than being worked directly, so
there's nowhere to record "attempted twice" or "appointment set" on the
referral itself. That needs:

- Contact-attempt controls on a received referral, mirroring the leads funnel
- "Contacted" surfacing back to the referrer
- "Appointment set" recorded in Launch Pad (not Rex)
- A push action on the referral, after which the Rex stages take over

That's the remaining gap for a TPE referral to be trackable end to end.

**Rex supports all of this natively** (probed read-only, 3 Aug 2026):

- `Dedupe/findPossibleDuplicates(service_name, match_fields, company_or_person,
  record_id)` → sets of `{winning_id, losing_ids, number_of_dupes, name,
  email_address, phone_number}`. Passing `record_id` asks the question for one
  contact, which is exactly the pre-push check.
- `Dedupe/combineRecords(service_name, winning_id, losing_ids)` → the merge.
- `Dedupe/queueMultipleCombine(service_name, duplicate_sets)` → bulk.
- `match_fields` takes **`email` / `name` / `phone`** — the match *types*, not
  field names. Anything else 400s.
- `Contacts/findPossibleDuplicates` and `Properties/findPossibleDuplicate`
  exist too.

**The existing duplicate problem is much bigger than our bug.** Counted
read-only on Rex account 3517 — which is **The Property Experts**, not
Lettings (see the account note in item 5):

| Match on | Duplicate sets | Redundant records | Biggest set |
|---|---|---|---|
| email + name + phone | 2,904 | 3,234 | 9 |
| email + name | 3,437 | 3,875 | 10 |
| email | 5,267 | 6,576 | 22 |
| phone | 6,592 | 9,515 | 88 |

An 88-record set on one phone number is years of imports, not our push path —
Launch Pad has nowhere near that volume. **Correcting an earlier claim of
mine: I attributed these to the criteria bug; at this scale that is wrong.**
The bug added to the pile but did not create it.

Which means a bulk merge is a **business decision about live CRM data**, not a
cleanup task — `combineRecords` is irreversible and would touch thousands of
records the lettings team works from daily. Not to be run without James, and
worth doing in Rex's own UI where a human can eyeball each set.

The push guard does **not** depend on that cleanup: `findPossibleDuplicates`
with a `record_id` answers "is this person already here?" per push, which is
what item 6 actually needs.

_Detail to be added._

---

## 7. V1 launch — The Lettings Experts only (Thu 6 Aug 2026) 🔶

V1 goes to TLE alone; V2 opens the platform to the rest of the group.

**Referrals are OFF in V1.** Not a technical limit — a referral network needs
somebody to refer TO. With only TLE on the platform a referral to The Mortgage
Experts would go nowhere, so the tab is locked and the API refuses.

Controlled by one env var, `LAUNCH_PHASE`. It **defaults to `v1`**, so Thursday
needs no action at all — the app is already correct when it ships. The only
manual step is turning V2 on (`LAUNCH_PHASE=v2` in Railway), which has no
deadline. The risky, time-pressured step is the one nobody has to remember.

What's locked in V1:
- Referrals nav item shows a padlock; the page renders behind a "coming soon"
  card with no CTA (there's nothing they could do to unlock it).
- `POST /api/referrals` returns 403. This is the real gate — the greying out
  is cosmetic.
- The referrals notification badge is suppressed.
- The signup wizard hides the "Referrals Free" account type: choosing it would
  create an account whose only feature is switched off.

### Paid Ads is included in the TLE Pro licence ✅ Built 4 Aug 2026

Read live from Team Hub's `partner_package` on TeamMember. Two outcomes for
TLE, and **neither is "pay us here"**:

| `partner_package` | Outcome |
|---|---|
| Pro | Free access — skips package + payment entirely |
| anything else, or unset | "Upgrade to Pro" screen, no card form |

TLE active partners as of 4 Aug 2026: **Pro 12, Basic 9, Academy 1,
Standard 1, unset 1.** So roughly half walk in free and half hit the upgrade
screen — worth knowing before the phones start.

**Fallback (James):** unset, or not found in the Hub, is treated as NOT Pro.
A genuine Pro partner with bad Hub data gets wrongly sent to upgrade and will
ring in — recoverable. The reverse silently gives the product away. One active
TLE partner has no package set, so expect that call.

**A bug worth remembering: Team Hub's `search` is CASE-SENSITIVE**, and 45% of
stored emails are mixed-case (246 of 544). Lowercasing the email before
searching — correct practice everywhere else — silently missed nearly half of
everyone, returning zero rows, which is indistinguishable from "not a partner".
Caught because a **Pro** partner testing with their work address was told to
upgrade. `packageForEmail` now pulls the directory once and matches in memory.
Don't turn it back into a per-email search.

### Pre-provisioning Pro partners with their live campaigns ✅ Built 4 Aug 2026

The launch-day experience: a Pro partner signs in and their real campaign,
spend and leads are already on screen. Their ads are already running — we
connect to them rather than creating anything.

`GET /api/admin/provision-tle?entries=[{email,campaignIds}]` → dry run.
`POST /api/admin/provision-tle?confirm=yes` → does it. **Sends no email**;
inviting stays a separate step (`/api/admin/send-invites`), so provisioning
can be done and checked days ahead without anyone being told.

**Separate ad accounts per partner need no configuration.** Campaign ids
resolve to their own ad account via Meta's `account_id` (`resolveTaggedId` in
`lib/meta.ts`), and `groupCampaignsByAccount` queries each separately. What
DOES matter is that the System User token can see those ad accounts; if it
can't, the dry run shows an error against that campaign.

Two things are verified rather than trusted:
- **Pro status is re-checked against Team Hub.** The uploaded list decides who
  we attempt, never who is entitled — otherwise a spreadsheet typo grants free
  Paid Ads. Confirmed working: a Basic partner in the list is skipped.
- **Campaign ids are read back from Meta with their real names.** A wrong id
  fails silently and shows one partner another partner's leads and spend, so
  the dry run prints the campaign name against each person to be checked by
  eye. NOTE: this only works where Meta is configured — run the dry run
  against production, not locally.

An existing account is updated, never password-reset: it may already be in
use, and forcing a shared launch password would be both a lockout and a
security problem.

### The Invite tab (admin) ✅ Built 4 Aug 2026 — TEMPORARY

Admin → **Invite**. Lists the 12 TLE Pro partners straight from Team Hub, with
their email pre-filled, a box for their Meta ad account or campaign, a Connect
button each, and Send All at the bottom.

`components/TleProInvite.tsx` + `GET/POST /api/admin/tle-pro`. Deliberately a
separate component rather than more lines in the 4,200-line admin page, so
removing it after V1 is a delete.

**Who can see it:** super admins (Admin → Invite) AND the Lettings MD, Susan,
at the top of her own **Invites** tab. It is NOT open to MDs generally — a
Property or Commercial MD gets a 401, since they have no business provisioning
TLE accounts. Verified: Susan 200, another brand's MD 401, no token 401.

**Connect prints the campaign NAMES it found.** That's the whole point of the
step: a wrong Meta id doesn't error, it silently attaches one partner to
another partner's spend and leads. The names next to the person are what catch
it. Accepts an ad account, campaign, ad set or ad id — all four resolve.

**Send All is deliberately disabled** until the invite mailbox is connected and
the email is written. It's shown rather than hidden so the flow reads properly,
but it cannot fire — it's the one action here that can't be undone.

Guards verified against live data: a Basic partner is refused (403), an unknown
address is refused, a bad Meta reference fails BEFORE anything is provisioned.
Pro status is re-read from Team Hub on every connect, so the roster on screen
decides who we offer to connect, never who is entitled.

### Not addressed, and worth a decision before V2

- **Nothing enforces payment.** Access is gated on `accountType`, not on
  `paid` — so a "paid" account works before Stripe confirms anything. This is
  pre-existing, not new, but V1 is the first time real money is involved.
- **A non-Pro TLE partner ends up with an empty account** in V1: not entitled
  to ads, and referrals are off. They're registered and ready for an upgrade,
  but there's nothing for them to use on day one.
- **This mechanism won't survive V2 as-is.** 73% of the wider group (268 of
  368 partners) has no `partner_package` recorded, so the same code would send
  almost everyone to the upgrade screen. That's a Team Hub data job, not a
  code change.

---

## Already landed

- ✅ (3 Aug) Rex search criteria fix — every `Contacts/search` in the app was
  failing, so `findOrCreateContact` created a duplicate on every push.
- ✅ (3 Aug) Live lettings referral stages from **Propoly** — tenant found,
  referencing, moved in, plus "didn't proceed" — joined on the landlord's
  email. Replaces the earlier Rex-sourced lettings flags, which were reading
  sale stock. See `lib/propoly.ts`.
- ✅ (3 Aug) Live TPE sales stages from Rex (appointment set, property listed,
  sold STC, exchanged), joined on the vendor's email.
- ✅ (3 Aug) Portal visual pass: one flat surface matching the landing page,
  hairline dividers instead of boxes, outline-only panels across Overview,
  Leads, Referrals, All Ads and Profile.
- ✅ (3 Aug) Advisory duplicate check on Rex push — reports, never blocks.
