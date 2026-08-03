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

Note: the Rex contact search was broken until 3 Aug 2026 (positional criteria
were rejected, so every lookup failed and each push created a fresh contact —
the live account has contacts duplicated up to 5×). Fixed in `lib/rex.ts`, but
**the existing duplicates still need merging**, and that should be settled
before pushing more volume.

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

**The existing duplicate problem is much bigger than our bug.** Counted on the
live TLE account, read-only:

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

## Already landed

- ✅ (3 Aug) Rex search criteria fix — every `Contacts/search` in the app was
  failing, so `findOrCreateContact` created a duplicate on every push.
- ✅ (3 Aug) Live lettings referral stages from Rex (appointment booked, on
  market, tenant found), joined on the landlord's email. Referencing and
  moved-in still need Propoly.
- ✅ (3 Aug) Live TPE sales stages from Rex (appointment set, property listed,
  sold STC, exchanged), joined on the vendor's email.
- ✅ (3 Aug) Portal visual pass: one flat surface matching the landing page,
  hairline dividers instead of boxes, outline-only panels across Overview,
  Leads, Referrals, All Ads and Profile.
- ✅ (3 Aug) Advisory duplicate check on Rex push — reports, never blocks.
