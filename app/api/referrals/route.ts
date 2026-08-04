import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth";
import { findById } from "@/lib/users-store";
import {
  createReferral,
  listForUser,
  getReferral,
  acceptReferral,
  declineReferral,
  markReferralPaid,
  addReferralNote,
} from "@/lib/referrals-store";
import { brandById, type BrandId } from "@/lib/brands";
import { referralsEnabled } from "@/lib/launch-phase";

async function currentUser(req: NextRequest) {
  const id = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!id) return null;
  return (await findById(id)) ?? null;
}

// The referrals this agent can see: sent by them + received by their brand.
export async function GET(req: NextRequest) {
  const user = await currentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  return NextResponse.json(await listForUser(user.id, user.brandId));
}

// Send a referral to another business.
export async function POST(req: NextRequest) {
  const user = await currentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  // The real gate. Greying out the nav is cosmetic — this is what stops a
  // referral being created in V1, when the receiving brand has nobody on the
  // platform to receive it. A referral accepted here would simply vanish.
  if (!referralsEnabled()) {
    return NextResponse.json(
      {
        error:
          "Referrals aren't open yet — they go live once the rest of the group is on Launch Pad.",
      },
      { status: 403 }
    );
  }
  const body = await req.json().catch(() => null);
  const toBrandId = String(body?.toBrandId ?? "");
  if (!brandById(toBrandId) || toBrandId === user.brandId) {
    return NextResponse.json(
      { error: "Pick a different business to refer to." },
      { status: 400 }
    );
  }
  const leadName = String(body?.leadName ?? "").trim();
  if (!leadName) {
    return NextResponse.json({ error: "Lead name is required." }, { status: 400 });
  }
  const referral = await createReferral({
    fromUserId: user.id,
    fromName: user.name,
    fromBrandId: user.brandId,
    toBrandId: toBrandId as BrandId,
    leadName,
    leadPhone: String(body?.leadPhone ?? "").trim(),
    leadEmail: String(body?.leadEmail ?? "").trim(),
    note: String(body?.note ?? "").trim(),
    feeAmount: Math.max(0, Number(body?.feeAmount) || 0),
    dueDate: body?.dueDate ? String(body.dueDate) : null,
  });
  return NextResponse.json(referral);
}

// Act on a referral: accept | decline | markPaid | note.
export async function PATCH(req: NextRequest) {
  const user = await currentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const id = String(body?.id ?? "");
  const action = String(body?.action ?? "");
  const referral = await getReferral(id);
  if (!referral) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isRecipient = referral.toBrandId === user.brandId;
  const isSender = referral.fromUserId === user.id;

  let updated;
  switch (action) {
    case "accept":
      if (!isRecipient) return forbidden();
      updated = await acceptReferral(id, user.id);
      break;
    case "decline":
      if (!isRecipient) return forbidden();
      updated = await declineReferral(id);
      break;
    case "markPaid":
      // Either side can record the payout in this framework stage.
      if (!isRecipient && !isSender) return forbidden();
      updated = await markReferralPaid(id);
      break;
    case "note":
      if (!isRecipient && !isSender) return forbidden();
      updated = await addReferralNote(
        id,
        `${user.name}: ${String(body?.text ?? "").slice(0, 500)}`
      );
      break;
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
  return NextResponse.json(updated);
}

function forbidden() {
  return NextResponse.json({ error: "Not allowed" }, { status: 403 });
}
