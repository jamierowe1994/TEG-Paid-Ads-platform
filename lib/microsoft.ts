import "server-only";
import { rotateMsRefreshToken, type StoredUser } from "./users-store";

// Microsoft 365 email, per agent. Each agent connects their own mailbox via
// OAuth ("Connect your email") — the portal holds a refresh token and sends
// lead emails AS them through Microsoft Graph. Delegated permissions only:
// the app can never touch a mailbox whose owner hasn't personally consented.
//
// Env (Railway):
//   AZURE_CLIENT_ID     — the app registration's Application (client) ID
//   AZURE_TENANT_ID     — the Directory (tenant) ID
//   AZURE_CLIENT_SECRET — the client secret VALUE (expires — diary it!)
//   AZURE_REDIRECT_URI  — optional override; defaults to the production
//                         callback (set it for local testing).

const GRAPH = "https://graph.microsoft.com/v1.0";
const SCOPES = "openid profile email offline_access User.Read Mail.Send";

const DEFAULT_REDIRECT =
  "https://teg-paid-ads-platform-production.up.railway.app/api/auth/microsoft/callback";

export function msConfigured(): boolean {
  return !!(
    process.env.AZURE_CLIENT_ID &&
    process.env.AZURE_TENANT_ID &&
    process.env.AZURE_CLIENT_SECRET
  );
}

export function msRedirectUri(): string {
  return process.env.AZURE_REDIRECT_URI ?? DEFAULT_REDIRECT;
}

// Our PUBLIC-facing origin, for building user-facing redirects. Behind
// Railway's proxy the app runs on an internal localhost port, so a route's
// own request origin (req.nextUrl.origin) resolves to http://localhost:8080 —
// which is what was bouncing agents to a dead localhost page after connecting
// their email. The OAuth redirect URI is by definition our public callback
// URL, so its origin is the right base to redirect back to.
export function appOrigin(): string {
  try {
    return new URL(msRedirectUri()).origin;
  } catch {
    return DEFAULT_REDIRECT.replace(/\/api\/.*/, "");
  }
}

function tokenEndpoint(): string {
  return `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`;
}

// Where to send the agent to sign in and consent. `state` is our CSRF nonce.
export function msAuthUrl(state: string): string {
  const q = new URLSearchParams({
    client_id: process.env.AZURE_CLIENT_ID ?? "",
    response_type: "code",
    redirect_uri: msRedirectUri(),
    response_mode: "query",
    scope: SCOPES,
    state,
    prompt: "select_account",
  });
  return `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/authorize?${q.toString()}`;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

async function tokenRequest(
  params: Record<string, string>
): Promise<TokenResponse> {
  const res = await fetch(tokenEndpoint(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.AZURE_CLIENT_ID ?? "",
      client_secret: process.env.AZURE_CLIENT_SECRET ?? "",
      redirect_uri: msRedirectUri(),
      scope: SCOPES,
      ...params,
    }),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || !data.access_token) {
    throw new Error(
      data.error_description ?? data.error ?? `Microsoft token error ${res.status}`
    );
  }
  return data;
}

// One-time exchange after the consent redirect.
export function msExchangeCode(code: string): Promise<TokenResponse> {
  return tokenRequest({ grant_type: "authorization_code", code });
}

// The signed-in Microsoft account behind an access token — email + name plus
// the profile fields we can pre-fill from (mobile, region), so signup doesn't
// have to ask for what's already on their work account. All best-effort:
// missing fields come back empty, never fabricated.
export interface MsProfile {
  email: string;
  name: string;
  mobile: string;
  region: string; // officeLocation, else city/state
}

export async function msGetMe(accessToken: string): Promise<MsProfile> {
  const res = await fetch(
    `${GRAPH}/me?$select=mail,userPrincipalName,displayName,mobilePhone,businessPhones,officeLocation,city,state`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    }
  );
  const me = (await res.json().catch(() => ({}))) as {
    mail?: string;
    userPrincipalName?: string;
    displayName?: string;
    mobilePhone?: string;
    businessPhones?: string[];
    officeLocation?: string;
    city?: string;
    state?: string;
  };
  if (!res.ok) throw new Error("Couldn't read the Microsoft account profile.");
  const email = me.mail ?? me.userPrincipalName ?? "";
  if (!email) throw new Error("The Microsoft account has no email address.");

  const mobile =
    (me.mobilePhone ?? "").trim() ||
    (me.businessPhones?.find((p) => p?.trim()) ?? "").trim();
  const region =
    (me.officeLocation ?? "").trim() ||
    [me.city, me.state].filter((s) => s?.trim()).join(", ");

  return { email, name: me.displayName ?? "", mobile, region };
}

// The account's profile photo as a data URL, or null if they don't have one
// (Graph 404s) or it's implausibly large. Only needs User.Read.
export async function msGetPhotoDataUrl(
  accessToken: string
): Promise<string | null> {
  try {
    const res = await fetch(`${GRAPH}/me/photo/$value`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!res.ok) return null; // 404 = no photo set
    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0 || buf.byteLength > 3_000_000) return null;
    const type = res.headers.get("content-type") || "image/jpeg";
    const base64 = Buffer.from(buf).toString("base64");
    return `data:${type};base64,${base64}`;
  } catch {
    return null;
  }
}

// Short-lived access tokens per user, refreshed from the stored refresh
// token. Microsoft rotates refresh tokens — when a new one comes back it's
// persisted so the connection never quietly dies.
const accessCache = new Map<string, { token: string; expiresAt: number }>();

export async function msAccessTokenFor(user: StoredUser): Promise<string> {
  if (!user.msRefreshToken) {
    throw new Error("This account hasn't connected their email yet.");
  }
  const cached = accessCache.get(user.id);
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  const data = await tokenRequest({
    grant_type: "refresh_token",
    refresh_token: user.msRefreshToken,
  });
  const token = data.access_token!;

  // Persist the rotated refresh token with a compare-and-swap: if the stored
  // token changed underneath us (a disconnect, or a newer rotation), the
  // write no-ops — an in-flight send must never resurrect a revoked
  // connection. In that case we also skip caching: this send completes,
  // nothing lingers.
  let stillConnected = true;
  if (data.refresh_token && data.refresh_token !== user.msRefreshToken) {
    stillConnected = await rotateMsRefreshToken(
      user.id,
      user.msRefreshToken,
      data.refresh_token
    );
  }
  if (stillConnected) {
    accessCache.set(user.id, {
      token,
      expiresAt: Date.now() + ((data.expires_in ?? 3600) - 120) * 1000,
    });
  } else {
    accessCache.delete(user.id);
  }
  return token;
}

/* Access token for the SYSTEM mailbox. Deliberately separate from
   msAccessTokenFor(user): that one persists rotated refresh tokens against a
   user record with a compare-and-swap, which makes no sense for a single
   global mailbox. Microsoft returns a long-lived refresh token here, so the
   stored one keeps working; if it is ever rejected the mailer clears it and
   the admin reconnects. */
export async function msRefreshSystemToken(
  refreshToken: string
): Promise<string> {
  const data = await tokenRequest({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  return data.access_token!;
}

export function msForgetUser(userId: string): void {
  accessCache.delete(userId);
}

// Send an email AS the connected agent (lands in their own Sent items).
export async function msSendMail(
  accessToken: string,
  opts: { to: string; subject: string; body: string; html?: boolean }
): Promise<void> {
  const res = await fetch(`${GRAPH}/me/sendMail`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        subject: opts.subject,
        body: {
          contentType: opts.html ? "HTML" : "Text",
          content: opts.body,
        },
        toRecipients: [{ emailAddress: { address: opts.to } }],
      },
      saveToSentItems: true,
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    // 401 = the grant is gone (revoked in Azure, expired, password reset) —
    // a typed error so callers can evict caches and say something human.
    if (res.status === 401) throw new Error("EMAIL_AUTH_EXPIRED");
    const data = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(data.error?.message ?? `Send failed (${res.status})`);
  }
}
