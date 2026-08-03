// Propoly — the tenancy pipeline for The Lettings Experts.
//
// Rex holds the sales side; the lettings side genuinely does not live there.
// (360 Rex listings sampled on 3 Aug 2026 were ALL `residential_sale` — there
// is no rental stock in Rex at all.) Propoly is where a tenancy is worked, so
// that is where the lettings stages come from.
//
// AUTH IS TWO-STEP AND EASY TO GET WRONG: `GET /api/v1/token` with the
// `x-api-key` and `agent-name` headers returns a token, and every subsequent
// call needs the Bearer token PLUS those same two headers. Dropping the
// headers once you have a token gives a 403.
//
// THE AWKWARD BIT — there is no server-side filtering. `?landlord_email=`,
// `?email=`, `?search=` and `?q=` are all accepted with a 200 and then
// silently IGNORED (each returns the unfiltered total of 864). `per_page` is
// likewise capped at 25 however large a value you send. So the only honest way
// to find one landlord's deals is to page the entire book — 35 requests as of
// 3 Aug 2026 — which is why the whole thing is fetched once and cached, rather
// than looked up per referral. Do not "optimise" this into a per-email query;
// it will appear to work and quietly return everyone.

const TOKEN_TTL_MS = 30 * 60 * 1000;
// The deal book changes over days, not seconds, and a cold build costs ~35
// requests and about 20 seconds (measured against live data, 3 Aug 2026). One
// shared copy serves every referral for every user, so the TTL is generous —
// tenancy progress simply does not move fast enough to justify paying that
// more than a couple of times an hour. The stage feed is fetched after the
// referrals render, so a cold build shows as stages arriving late, not as a
// blocked page.
const BOOK_TTL_MS = 30 * 60 * 1000;
const PAGE_SIZE = 25; // Propoly's hard cap, whatever we ask for.
const MAX_PAGES = 200; // Backstop so a pagination change can't loop forever.
const CONCURRENCY = 5;

/** One landlord as Propoly projects them onto a deal. */
export interface PropolyLandlord {
  uuid?: string;
  name?: string;
  email?: string;
  phone?: string;
}

/** Only the deal fields the tracker actually reads. */
export interface PropolyDeal {
  uuid?: string;
  tenancy_status?: string;
  move_in_date?: string;
  property_address?: string;
  property_uuid?: string;
  landlord_details?: PropolyLandlord[];
  created_at?: string;
  updated_at?: string;
}

export function propolyConfigured(): boolean {
  return Boolean(
    process.env.PROPOLY_API_KEY &&
      process.env.PROPOLY_AGENT_NAME &&
      process.env.PROPOLY_API_BASE
  );
}

function baseHeaders(): Record<string, string> {
  return {
    "x-api-key": process.env.PROPOLY_API_KEY ?? "",
    "agent-name": process.env.PROPOLY_AGENT_NAME ?? "",
  };
}

let tokenCache: { token: string; at: number } | null = null;

async function getToken(): Promise<string | null> {
  if (tokenCache && Date.now() - tokenCache.at < TOKEN_TTL_MS) {
    return tokenCache.token;
  }
  const base = process.env.PROPOLY_API_BASE;
  if (!base) return null;
  const res = await fetch(`${base}/api/v1/token`, { headers: baseHeaders() });
  if (!res.ok) return null;
  const body = (await res.json()) as { token?: string };
  if (!body?.token) return null;
  tokenCache = { token: body.token, at: Date.now() };
  return body.token;
}

async function get<T>(path: string): Promise<T | null> {
  const token = await getToken();
  if (!token) return null;
  const res = await fetch(`${process.env.PROPOLY_API_BASE}${path}`, {
    // Bearer AND the two base headers — see the note at the top of this file.
    headers: { ...baseHeaders(), Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 || res.status === 403) {
    // Token may have expired early; drop it so the next call re-authenticates.
    tokenCache = null;
    return null;
  }
  if (!res.ok) return null;
  return (await res.json()) as T;
}

interface DealsPage {
  deals?: PropolyDeal[];
  total_entries?: number;
  per_page?: number;
}

/**
 * Every deal, indexed by landlord email.
 *
 * `complete` is false when any page failed, so a partial book is never mistaken
 * for the whole book — a landlord missing from a partial fetch must read as
 * "we couldn't check", not "nothing is happening".
 */
export interface DealBook {
  byLandlordEmail: Map<string, PropolyDeal[]>;
  total: number;
  complete: boolean;
  fetchedAt: number;
}

let bookCache: DealBook | null = null;
let bookInFlight: Promise<DealBook> | null = null;

function indexDeals(deals: PropolyDeal[]): Map<string, PropolyDeal[]> {
  const map = new Map<string, PropolyDeal[]>();
  for (const deal of deals) {
    for (const landlord of deal.landlord_details ?? []) {
      const email = landlord.email?.trim().toLowerCase();
      if (!email) continue;
      const existing = map.get(email);
      if (existing) existing.push(deal);
      else map.set(email, [deal]);
    }
  }
  return map;
}

async function fetchBook(): Promise<DealBook> {
  const empty: DealBook = {
    byLandlordEmail: new Map(),
    total: 0,
    complete: false,
    fetchedAt: Date.now(),
  };
  if (!propolyConfigured()) return empty;

  const first = await get<DealsPage>(`/api/v1/deals?page=1&per_page=${PAGE_SIZE}`);
  if (!first?.deals) return empty;

  const deals = [...first.deals];
  const total = first.total_entries ?? deals.length;
  const pages = Math.min(Math.ceil(total / PAGE_SIZE), MAX_PAGES);
  let complete = true;

  // Pages 2..n, a few at a time. Sequential would be ~35 round trips; all at
  // once would hammer an API that has given us no rate-limit guidance.
  for (let start = 2; start <= pages; start += CONCURRENCY) {
    const batch = [];
    for (let p = start; p < start + CONCURRENCY && p <= pages; p++) {
      batch.push(get<DealsPage>(`/api/v1/deals?page=${p}&per_page=${PAGE_SIZE}`));
    }
    for (const page of await Promise.all(batch)) {
      if (page?.deals) deals.push(...page.deals);
      else complete = false;
    }
  }

  return {
    byLandlordEmail: indexDeals(deals),
    total: deals.length,
    complete: complete && deals.length >= total,
    fetchedAt: Date.now(),
  };
}

/**
 * The cached deal book, rebuilt at most once per TTL.
 *
 * Concurrent callers share one in-flight fetch — otherwise ten referrals
 * rendering together would each kick off their own 35-request crawl.
 */
export async function dealBook(): Promise<DealBook> {
  if (bookCache && Date.now() - bookCache.fetchedAt < BOOK_TTL_MS) {
    return bookCache;
  }
  if (bookInFlight) return bookInFlight;
  bookInFlight = fetchBook()
    .then((book) => {
      // Only promote a complete book to the cache. A partial one is still
      // returned to the caller (with complete:false) but must not be pinned
      // for ten minutes as though it were the truth.
      if (book.complete) bookCache = book;
      return book;
    })
    .finally(() => {
      bookInFlight = null;
    });
  return bookInFlight;
}

/** Every deal Propoly holds for this landlord, newest first. */
export async function dealsForLandlord(
  email: string
): Promise<{ deals: PropolyDeal[]; lookedUp: boolean }> {
  const clean = email.trim().toLowerCase();
  if (!clean || !propolyConfigured()) return { deals: [], lookedUp: false };
  const book = await dealBook();
  const deals = book.byLandlordEmail.get(clean) ?? [];
  // A landlord absent from an INCOMPLETE book tells us nothing. Say so, rather
  // than reporting an empty pipeline for someone who may well be mid-tenancy.
  const lookedUp = book.complete || deals.length > 0;
  return {
    deals: [...deals].sort((a, b) =>
      String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""))
    ),
    lookedUp,
  };
}

// The tenancy pipeline in order, confirmed against all 864 live deals
// (3 Aug 2026). Counts at the time: start_deal 23, holding_fee 10,
// references 38, tenancy_generation 13, signing_and_move_in_monies 30,
// complete 556, cancelled 194.
const STATUS_ORDER = [
  "start_deal",
  "holding_fee",
  "references",
  "tenancy_generation",
  "signing_and_move_in_monies",
  "complete",
] as const;

const REFERENCING_FROM = STATUS_ORDER.indexOf("references");

function rank(status: string | undefined): number {
  return STATUS_ORDER.indexOf(
    String(status ?? "").toLowerCase() as (typeof STATUS_ORDER)[number]
  );
}

/** What Propoly can tell us about one landlord's tenancy progress. */
export interface TenancyProgress {
  /** A deal exists at all — a tenant has been found and a tenancy started. */
  tenantFound: boolean;
  /** Reached referencing or beyond. */
  referencing: boolean;
  /** The tenancy completed. */
  movedIn: boolean;
  /** Every deal for this landlord was cancelled — the referral stalled. */
  didNotProceed: boolean;
  /** False when Propoly had nothing to say, or couldn't be asked. */
  matched: boolean;
}

export function noTenancyProgress(): TenancyProgress {
  return {
    tenantFound: false,
    referencing: false,
    movedIn: false,
    didNotProceed: false,
    matched: false,
  };
}

/**
 * Collapse a landlord's deals into pipeline flags.
 *
 * A landlord can hold several deals (re-lets, multiple properties), so we take
 * the FURTHEST any of them reached. Showing their best progress matches how a
 * referrer thinks about it — the referral paid off if any tenancy completed.
 */
export async function tenancyProgressFor(
  email: string
): Promise<TenancyProgress> {
  const { deals, lookedUp } = await dealsForLandlord(email);
  const out = noTenancyProgress();
  if (!lookedUp || !deals.length) return out;
  out.matched = true;

  const live = deals.filter(
    (d) => String(d.tenancy_status ?? "").toLowerCase() !== "cancelled"
  );
  // Every deal cancelled is a real, reportable outcome — not an empty pipeline.
  if (!live.length) {
    out.didNotProceed = true;
    return out;
  }

  out.tenantFound = true;
  const best = Math.max(...live.map((d) => rank(d.tenancy_status)));
  if (best >= REFERENCING_FROM) out.referencing = true;
  if (best === STATUS_ORDER.indexOf("complete")) out.movedIn = true;

  // NOT derived from move_in_date: it is populated on all 864 deals including
  // cancelled ones and deals that have barely started, so it is the PLANNED
  // move-in date, not evidence that anyone moved in. `complete` is the signal.

  // Referencing implies a tenant was found; completing implies referencing.
  if (out.movedIn) out.referencing = true;
  return out;
}
