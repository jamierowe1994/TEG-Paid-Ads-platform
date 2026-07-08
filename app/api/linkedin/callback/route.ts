import { NextRequest, NextResponse } from "next/server";
import { linkedinExchangeCode } from "@/lib/linkedin";

// LinkedIn OAuth redirect target. Validates the state cookie set when the
// admin started the connect, exchanges the code for tokens, then bounces back
// to the admin Connections tab.
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error_description") || url.searchParams.get("error");
  const expected = req.cookies.get("li_oauth_state")?.value;

  const back = (params: string) =>
    NextResponse.redirect(new URL(`/admin?${params}`, req.url));

  if (error) return back(`linkedin=error&msg=${encodeURIComponent(error)}`);
  if (!code || !state || state !== expected) {
    return back("linkedin=error&msg=Invalid%20state");
  }
  try {
    await linkedinExchangeCode(code);
    const res = back("linkedin=connected");
    res.cookies.set("li_oauth_state", "", { path: "/", maxAge: 0 });
    return res;
  } catch (e) {
    return back(
      `linkedin=error&msg=${encodeURIComponent(e instanceof Error ? e.message : "exchange failed")}`
    );
  }
}
