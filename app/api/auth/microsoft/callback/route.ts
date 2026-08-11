import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth";
import {
  findById,
  findByMsEmail,
  setMsConnection,
  updateUser,
} from "@/lib/users-store";
import {
  msExchangeCode,
  msGetMe,
  msGetPhotoDataUrl,
  msForgetUser,
  appOrigin,
} from "@/lib/microsoft";
import { setSystemMailbox } from "@/lib/system-mailbox";
import { rexFindUserIdByEmail,
  rexAccountForBrand } from "@/lib/rex";
import { atlasHasUser } from "@/lib/atlas";

// Brands whose CRM is Rex — same set the push/duplicate-check routes use.
const REX_BRANDS = new Set(["property", "lettings", "fineandcountry", "auction"]);

// Microsoft sends the agent back here after consent. Store the connection,
// then use the email to line their CRM identity up automatically: Rex brands
// get their Rex user matched by email (owns their pushed leads); Recruitment
// checks the email is an Atlas user (push attribution lands in their name).
export async function GET(req: NextRequest) {
  const back = (params: string) =>
    NextResponse.redirect(
      new URL(`/dashboard/profile?${params}`, appOrigin())
    );

  /* Two flows land here. The system-mailbox one (started from the admin
     Connections tab) is identified by its own nonce cookie, and is handled
     first because it has no portal session at all — an admin isn't
     necessarily a portal user. Sharing this callback means only ONE redirect
     URI has to be registered in Azure. */
  const adminNonce = req.cookies.get("teg_admin_mb_state")?.value;
  if (adminNonce) {
    return handleSystemMailbox(req, adminNonce);
  }

  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!userId) {
    return NextResponse.redirect(new URL("/login", appOrigin()));
  }

  // The state cookie carries `${nonce}:${userId}` — BOTH must match: the
  // nonce proves this browser started the flow (CSRF), the userId proves the
  // SAME portal user is still signed in (a mid-flow session swap on a shared
  // machine must not attach one agent's mailbox to another agent's record).
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const cookieRaw = req.cookies.get("teg_ms_state")?.value ?? "";
  const [cookieState, cookieUserId] = cookieRaw.split(":");
  if (
    !code ||
    !state ||
    !cookieState ||
    state !== cookieState ||
    cookieUserId !== userId
  ) {
    return back("email=error");
  }

  try {
    const tokens = await msExchangeCode(code);
    const me = await msGetMe(tokens.access_token!);
    if (!tokens.refresh_token) {
      // offline_access missing from the consent — can't send later.
      return back("email=error");
    }

    const user = await findById(userId);
    if (!user) {
      return NextResponse.redirect(new URL("/login", appOrigin()));
    }

    // One mailbox, one portal user — otherwise two people could quietly hold
    // live send-as tokens for the same address.
    const holder = await findByMsEmail(me.email);
    if (holder && holder.id !== userId) {
      const res = back("email=inuse");
      res.cookies.delete("teg_ms_state");
      return res;
    }

    msForgetUser(userId); // drop any stale cached access token
    await setMsConnection(userId, {
      email: me.email,
      connectedAt: new Date().toISOString(),
      refreshToken: tokens.refresh_token,
    });

    // Whether they connected the address we know them by — CRM identity and
    // profile enrichment only run on THEIR OWN email, otherwise signing into a
    // shared or colleague's mailbox would pull someone else's details.
    const ownEmail =
      me.email.trim().toLowerCase() === user.email.trim().toLowerCase();

    // Pull profile details straight from their work account so signup doesn't
    // have to ask — mobile, region and headshot. Only fills what we DON'T
    // already have, and never fabricates: an empty field on their account just
    // stays empty here (the profile then offers to fill it in).
    if (ownEmail) {
      const enrich: Record<string, unknown> = {};
      if (!user.mobile?.trim() && me.mobile) enrich.mobile = me.mobile;
      if (!user.location?.trim() && me.region) enrich.location = me.region;
      if (!user.photo) {
        const photo = await msGetPhotoDataUrl(tokens.access_token!);
        if (photo) enrich.photo = photo;
      }
      if (Object.keys(enrich).length > 0) {
        try {
          await updateUser(userId, enrich);
        } catch {
          /* enrichment is best-effort — never block the connection */
        }
      }
    }

    let crm = "skipped";
    if (ownEmail) {
      try {
        if (REX_BRANDS.has(user.brandId)) {
          if (user.rexUserId) {
            crm = "already";
          } else {
            const rexId = await rexFindUserIdByEmail(me.email, user.brandId);
            if (rexId) {
              await updateUser(userId, {
                rexUserId: rexId,
                // Stamp WHICH account this id belongs to — an id from the
                // demo account is meaningless in the live one.
                rexAccountId: rexAccountForBrand(user.brandId),
              });
              crm = "matched";
            } else {
              crm = "nomatch";
            }
          }
        } else if (user.brandId === "recruitment") {
          const has = await atlasHasUser(me.email);
          crm = has === true ? "matched" : has === false ? "nomatch" : "skipped";
        }
      } catch {
        /* leave crm=skipped */
      }
    } else {
      crm = "differentemail";
    }

    const res = back(`email=connected&crm=${crm}`);
    res.cookies.delete("teg_ms_state");
    return res;
  } catch {
    return back("email=error");
  }
}

/* Consent for the shared system mailbox. Stored globally rather than against
   a user: everything the platform sends on its own behalf (invites, password
   resets, admin alerts) goes out from here. */
async function handleSystemMailbox(req: NextRequest, cookieNonce: string) {
  const back = (params: string) =>
    NextResponse.redirect(
      new URL(`/admin?tab=connections&${params}`, appOrigin())
    );

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");

  const clear = (res: NextResponse) => {
    res.cookies.delete("teg_admin_mb_state");
    return res;
  };

  if (!code || !state || state !== cookieNonce) {
    return clear(back("mailbox=error"));
  }

  try {
    const tokens = await msExchangeCode(code);
    if (!tokens.refresh_token) {
      // offline_access wasn't granted — we could send once and never again.
      return clear(back("mailbox=norefresh"));
    }
    const me = await msGetMe(tokens.access_token!);

    await setSystemMailbox({
      email: me.email,
      refreshToken: tokens.refresh_token,
      connectedAt: new Date().toISOString(),
      connectedBy: me.email,
    });

    return clear(back(`mailbox=connected&address=${encodeURIComponent(me.email)}`));
  } catch (err) {
    console.error("[mailbox] system mailbox connect failed:", err);
    return clear(back("mailbox=error"));
  }
}
