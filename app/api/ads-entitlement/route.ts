// Does this person pay for Paid Ads, get it included, or need to upgrade?
//
// Called during signup, BEFORE the package and payment steps, so the wizard can
// skip them entirely for a TLE Pro partner and divert everyone else at TLE to
// the upgrade route instead of a card form.
//
// Unauthenticated by necessity — it's asked mid-signup, before an account
// exists. It therefore answers only about the email it was given and returns a
// tier name, never anything else about that person. It is a yes/no on billing,
// not a lookup tool for the staff directory.

import { NextRequest, NextResponse } from "next/server";
import { adsEntitlementFor } from "@/lib/ads-entitlement";
import { brandById, type BrandId } from "@/lib/brands";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? "").trim();
  const brandId = String(body?.brandId ?? "");

  if (!email || !brandById(brandId)) {
    return NextResponse.json(
      { error: "An email and a business are required." },
      { status: 400 }
    );
  }

  const entitlement = await adsEntitlementFor(email, brandId as BrandId);
  return NextResponse.json(entitlement);
}
