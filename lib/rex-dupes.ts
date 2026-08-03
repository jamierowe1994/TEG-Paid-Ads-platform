// Duplicate awareness for Rex pushes.
//
// THE RULE (James, 3 Aug 2026): a push must NEVER be blocked. Getting the file
// into Rex and tracked is the priority; a duplicate can be merged there
// afterwards, but a referral that never arrived is lost. So everything here is
// ADVISORY — it reports what it found and the push proceeds regardless.
//
// This deliberately reverses an earlier plan to refuse partial matches. If you
// are tempted to make this blocking again, that is a product decision, not a
// tidy-up.
//
// Rex does the matching itself via its Dedupe service, so we inherit whatever
// its own de-duplication considers a match rather than reinventing address
// comparison ("12 High St" vs "12 High Street" vs "Flat 2, 12 High St") — which
// is the part that would go wrong quietly.
//
// Note on scale: the live account already holds thousands of duplicate sets
// from years of imports (~2,900 on the strictest match). So a hit here is
// common and is NOT evidence that this push misbehaved.

import { rexAccountForBrand, rexCallRaw } from "@/lib/rex";

/** What Rex's Dedupe service says about one contact. */
export interface DuplicateReport {
  /** Contacts Rex considers the same person, excluding the one we pushed. */
  duplicateIds: string[];
  /** Rex's preferred survivor, if it named one. */
  winningId: string | null;
  /** Which of email / name / phone were matched on. */
  matchedOn: string[];
  /** True when the check itself couldn't run — never treat as "no duplicates". */
  checkFailed: boolean;
}

export function noDuplicateReport(checkFailed = false): DuplicateReport {
  return { duplicateIds: [], winningId: null, matchedOn: [], checkFailed };
}

// Rex only accepts these three match TYPES — not field names. Passing
// "email_address" is rejected outright.
const MATCH_FIELDS = ["email", "name", "phone"];

/**
 * Ask Rex whether a freshly-pushed contact looks like one it already holds.
 *
 * Never throws: a failed check returns `checkFailed: true` so the caller can
 * say "we couldn't check" rather than the far worse "no duplicates found".
 */
export async function duplicatesForContact(
  contactId: string,
  brandId: string
): Promise<DuplicateReport> {
  if (!contactId) return noDuplicateReport();
  try {
    const res = await rexCallRaw(
      "Dedupe/findPossibleDuplicates",
      {
        service_name: "Contacts",
        match_fields: MATCH_FIELDS,
        company_or_person: "person",
        record_id: contactId,
      },
      rexAccountForBrand(brandId)
    );
    if (!res.ok) return noDuplicateReport(true);

    const raw = res.result;
    const sets = (
      Array.isArray(raw) ? raw : ((raw as { rows?: unknown[] })?.rows ?? [])
    ) as Array<{
      winning_id?: unknown;
      losing_ids?: unknown;
    }>;

    const ids = new Set<string>();
    let winningId: string | null = null;
    for (const s of sets) {
      const win = s.winning_id == null ? null : String(s.winning_id);
      if (win && win !== contactId) {
        ids.add(win);
        winningId ??= win;
      }
      for (const l of Array.isArray(s.losing_ids) ? s.losing_ids : []) {
        const id = String(l);
        if (id !== contactId) ids.add(id);
      }
    }
    return {
      duplicateIds: [...ids],
      winningId,
      matchedOn: ids.size ? MATCH_FIELDS : [],
      checkFailed: false,
    };
  } catch {
    return noDuplicateReport(true);
  }
}
