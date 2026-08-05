import "server-only";

/* Rex Embedded Apps — signing someone in because REX says who they are.
 *
 * Rex can host Launch Pad in an iframe and merge live values into the URL:
 * {{token}}, {{user_id}}, {{account_id}}, {{account_name}}, {{record_id}}.
 * `{{token}}` is the signed-in Rex user's own API session token, and that is
 * what makes this an identity assertion rather than a guess: we hand the token
 * back to Rex and ask who it belongs to. Only Rex can mint a valid one — a
 * forged token returns 401 "The token you have provided was not found"
 * (verified against the live API, 5 Aug 2026).
 *
 * THE TOKEN IS A CREDENTIAL, NOT AN IDENTIFIER. It grants Rex API access AS
 * that user. So it is used once, server-side, and never stored, never logged,
 * and never sent to the browser. The URL it arrives in is replaced immediately
 * so it doesn't sit in history, referrer headers or server logs.
 *
 * WHAT WE DO NOT TRUST: the `user_id` and `account_id` parameters. Anyone can
 * type those into a URL. Identity comes only from what Rex returns for the
 * token. They're accepted for logging/debugging and cross-checked, never
 * believed.
 */

const BASE = process.env.REX_API_BASE ?? "https://api.uk.rexsoftware.com";

/** Who Rex says the holder of a token is. */
export interface RexIdentity {
  accountUserId: string | null;
  email: string;
  fullName: string;
  isAccountOwner: boolean;
}

export type RexEmbedResult =
  | { ok: true; identity: RexIdentity }
  /** The token was rejected by Rex, or we couldn't ask. Never treat as valid. */
  | {
      ok: false;
      reason: "invalid_token" | "unreachable" | "no_email" | "service_account";
    };

/** Is the embed entry point switched on? Off by default — it's an auth path. */
export function rexEmbedEnabled(): boolean {
  return process.env.REX_EMBED_ENABLED === "1";
}

/**
 * Refuse the SERVICE account.
 *
 * Found while testing (5 Aug 2026): the Rex API login this app uses resolves
 * to a real person's address, which also has a Launch Pad account — so a
 * token minted from REX_API_PASSWORD would open that account through the
 * embed. Nobody signs into Rex's UI as the integration user, so a token
 * bearing its address is never a human clicking a tab.
 *
 * It isn't a new hole — anyone holding those credentials already has full CRM
 * access, which is worse — but it costs one comparison to close, and it keeps
 * a shared password out of the list of ways into somebody's account.
 */
function isServiceAccount(email: string): boolean {
  const service = (process.env.REX_API_EMAIL ?? "").trim().toLowerCase();
  return !!service && service === email.trim().toLowerCase();
}

/**
 * Ask Rex who a token belongs to.
 *
 * Deliberately fails CLOSED: anything other than a clean identity from Rex
 * returns ok:false. An outage must never sign anybody in.
 */
export async function identifyRexToken(
  token: string
): Promise<RexEmbedResult> {
  const clean = token.trim();
  if (!clean) return { ok: false, reason: "invalid_token" };

  let res: Response;
  try {
    res = await fetch(`${BASE}/v1/rex/UserProfile/read`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${clean}`,
      },
      body: JSON.stringify({}),
      cache: "no-store",
    });
  } catch {
    return { ok: false, reason: "unreachable" };
  }

  // 401 is the expected answer for a bad or expired token.
  if (res.status === 401) return { ok: false, reason: "invalid_token" };
  if (!res.ok) return { ok: false, reason: "unreachable" };

  const body = (await res.json().catch(() => null)) as {
    result?: {
      id?: unknown;
      account_user_id?: unknown;
      email?: unknown;
      full_name?: unknown;
      is_account_owner?: unknown;
    };
  } | null;

  const r = body?.result;
  const email = String(r?.email ?? "").trim().toLowerCase();
  // No email means we can't match them to a Launch Pad account, and matching
  // on anything softer (name) would be guessing at an identity.
  if (!email) return { ok: false, reason: "no_email" };
  if (isServiceAccount(email)) return { ok: false, reason: "service_account" };

  return {
    ok: true,
    identity: {
      accountUserId: r?.account_user_id == null ? null : String(r.account_user_id),
      email,
      fullName: String(r?.full_name ?? "").trim(),
      isAccountOwner: r?.is_account_owner === true,
    },
  };
}

/**
 * Session cookie options for an embedded session.
 *
 * SameSite=None is REQUIRED here and nowhere else: Rex is a different site, so
 * inside its iframe a Lax cookie is simply not sent and the user would appear
 * signed out no matter what we do.
 *
 * The cost, stated plainly: SameSite is a CSRF defence, and None gives it up
 * for these sessions. That's the accepted trade for third-party iframe SSO,
 * but it means embed sessions lean entirely on the app's own checks. Do not
 * widen this to normal sign-ins, which keep Lax.
 */
export function embedCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: "none" as const,
    // SameSite=None is only honoured on secure cookies, so this must be true
    // in production. Locally over http the browser will refuse it — that's
    // expected, and why the embed is tested against the deployed site.
    secure: true,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
