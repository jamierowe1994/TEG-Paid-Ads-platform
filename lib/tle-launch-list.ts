import "server-only";

/* The TLE V1 launch list — TEMPORARY, and the definitive answer to "who gets
 * Paid Ads on Thursday".
 *
 * WHY THIS EXISTS INSTEAD OF READING TEAM HUB
 * Team Hub's `partner_package` is stale for TLE. Checked 4 Aug 2026 against
 * the list Susan sent: of her 13 people, only FOUR were marked Pro in the Hub.
 * Five were still on Basic or Academy despite Susan's sheet showing a Pro
 * licence start of Nov-25 or May-26; three are dual-brand partners filed under
 * TPE or PPE, so a lettings query could never return them whatever their
 * package said; and one isn't in the Hub at all. (That last one, Kirstie Wallington, turned
 * out to be Kirstie Mulholland under a changed name — confirmed 5 Aug. Her Hub
 * record still says Mulholland; Launch Pad uses the Wallington address because
 * that's the mailbox she actually has.)
 *
 * Meanwhile the Hub marks EIGHT other TLE people as Pro who aren't on Susan's
 * list — under the old rule they'd have walked into free Paid Ads on launch day.
 *
 * The fix belongs in Team Hub, and Susan and Howard are doing it. This list
 * unblocks Thursday without anyone guessing at licence data in the meantime.
 * Deliberately NOT done by writing to Team Hub: that's a live staff directory
 * feeding billing and reporting, and it isn't ours to correct on a hunch.
 *
 * HOW TO RETIRE IT
 * Once Susan and Howard have updated the Hub: re-run the comparison, confirm
 * the Hub's Pro list matches this one, then set LAUNCH_LIST_ACTIVE to false and
 * delete this file. `licenceIncludesAds` falls straight back to reading
 * `partner_package`, which is where the answer should come from.
 *
 * Note several addresses are on TPE / Prestige domains. That's correct — they
 * are dual-brand partners doing both sales and lettings, and they get a
 * lettings account for this launch (James, 4 Aug 2026).
 */

/** Flip to false once Team Hub is the source of truth again, then delete this file. */
export const LAUNCH_LIST_ACTIVE = true;

export interface LaunchListEntry {
  name: string;
  /** Null when we don't know it — the Invite tab lets it be typed in. */
  email: string | null;
  /** Other addresses the same person is known by. One entry, one human:
   *  a name change leaves the old address in Team Hub while the new one is
   *  what they actually sign in with, and either should be accepted. */
  altEmails?: string[];
  area: string;
  note?: string;
}

export const TLE_LAUNCH_LIST: LaunchListEntry[] = [
  { name: "Bernadine Williams", email: "bernadine@thepropertyexperts.co.uk", area: "St Albans" },
  { name: "Dan Richards", email: "dan.richards@thelettingexperts.co.uk", area: "Wolverhampton" },
  { name: "Chris Wilson-Slight", email: "chris@prestigepropertyexperts.co.uk", area: "Nottinghamshire" },
  {
    name: "Kirstie Wallington",
    email: "kirstie.wallington@thelettingexperts.co.uk",
    altEmails: ["kirstie.mulholland@thelettingexperts.co.uk"],
    area: "Leicestershire",
    note: "Same person as Kirstie Mulholland in Team Hub — confirmed 5 Aug 2026. Her email is the Wallington one, so that's the account. Also runs TLE back-office and gets the £100 ad spend without paying for Pro. CHECK THE ADDRESS ON SCREEN before connecting: it follows the pattern every other TLE address uses, but nobody has read it back from her.",
  },
  { name: "James Crumpton", email: "james.crumpton@thepropertyexperts.co.uk", area: "Bristol" },
  { name: "Sean McMahon", email: "sean.mcmahon@thelettingexperts.co.uk", area: "Edinburgh" },
  { name: "Graham Cross", email: "graham.cross@thepropertyexperts.co.uk", area: "Hinckley & Bosworth" },
  { name: "Kayleigh Wright", email: "kayleigh.wright@thelettingexperts.co.uk", area: "Liverpool" },
  { name: "Lauren Engley", email: "lauren.engley@thelettingexperts.co.uk", area: "Bristol" },
  { name: "Richard Callow", email: "richard.callow@thelettingexperts.co.uk", area: "Oxford" },
  { name: "Zilvinas Navickis", email: "zill@thepropertyexperts.co.uk", area: "Dorset" },
  { name: "Elizabeth Ogunfowokan", email: "elizabeth.ogunfowokan@thelettingexperts.co.uk", area: "Chelmsford" },
  { name: "Edward Westwood", email: "edward.westwood@thelettingexperts.co.uk", area: "Stourbridge" },
];

const byEmail = new Map<string, LaunchListEntry>();
for (const e of TLE_LAUNCH_LIST) {
  for (const addr of [e.email, ...(e.altEmails ?? [])]) {
    if (addr) byEmail.set(addr.toLowerCase(), e);
  }
}
const byName = new Map(
  TLE_LAUNCH_LIST.map((e) => [e.name.toLowerCase().replace(/[^a-z]/g, ""), e])
);

/**
 * Is this person on the launch list?
 *
 * Matches on email, falling back to name for the one entry whose address we
 * don't hold yet — otherwise she could never be connected, since the address
 * only arrives when someone types it into the Invite tab.
 */
export function onLaunchList(email: string, name?: string): boolean {
  const e = email.trim().toLowerCase();
  if (e && byEmail.has(e)) return true;
  if (!name) return false;
  const entry = byName.get(name.toLowerCase().replace(/[^a-z]/g, ""));
  // Only trust the name when we have no address on file for them. Once an
  // address is recorded, that's the check — a name alone shouldn't grant it.
  return !!entry && entry.email === null;
}

export function launchListEntry(email: string): LaunchListEntry | undefined {
  return byEmail.get(email.trim().toLowerCase());
}
