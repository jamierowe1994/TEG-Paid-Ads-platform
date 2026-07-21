import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth";
import { findById, updateUser, toPublic } from "@/lib/users-store";

async function currentUserId(req: NextRequest): Promise<string | null> {
  return verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
}

// Normalise a pasted micro-site link into a storable URL, or null. Adds a
// protocol if they left it off (people paste "myname.co.uk"), and only keeps
// http(s) URLs — returns undefined for anything that isn't a plausible link so
// the caller can reject it.
function normaliseMicrosite(raw: string): string | null | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return null; // empty = clear it
  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withProto);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    if (!url.hostname.includes(".")) return undefined; // needs a real domain
    return url.toString();
  } catch {
    return undefined;
  }
}

// Return the signed-in user (validates the session cookie server-side).
export async function GET(req: NextRequest) {
  const id = await currentUserId(req);
  if (!id) return NextResponse.json({ user: null }, { status: 401 });
  const user = await findById(id);
  if (!user) return NextResponse.json({ user: null }, { status: 401 });
  return NextResponse.json({ user: toPublic(user) });
}

// Update editable profile fields (name, mobile, location, photo).
export async function PATCH(req: NextRequest) {
  const id = await currentUserId(req);
  if (!id) return NextResponse.json({ user: null }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (typeof body.name === "string") patch.name = body.name.trim();
  if (typeof body.mobile === "string") patch.mobile = body.mobile.trim();
  if (typeof body.location === "string") patch.location = body.location.trim();
  if (typeof body.photo === "string" || body.photo === null)
    patch.photo = body.photo;
  // Micro-site: accept a string (normalised) or null (clear). Reject anything
  // that isn't a plausible link so we never store junk.
  if (typeof body.micrositeUrl === "string" || body.micrositeUrl === null) {
    const normalised =
      body.micrositeUrl === null
        ? null
        : normaliseMicrosite(body.micrositeUrl);
    if (normalised === undefined) {
      return NextResponse.json(
        { error: "That doesn't look like a valid web address." },
        { status: 400 }
      );
    }
    patch.micrositeUrl = normalised;
  }

  const updated = await updateUser(id, patch);
  if (!updated) return NextResponse.json({ user: null }, { status: 401 });
  return NextResponse.json({ user: toPublic(updated) });
}
