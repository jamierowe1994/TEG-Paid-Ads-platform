// Which launch phase the server is in, so the client can lock the right things.
//
// This exists so LAUNCH_PHASE stays a SINGLE env var. The obvious alternative —
// a NEXT_PUBLIC_ twin read straight from the bundle — means two variables that
// can disagree, and the failure is silent: the nav would show Referrals while
// the API refuses them, or hide a feature that's actually live.
//
// Not secret, and deliberately unauthenticated: it's the same information
// anyone sees by looking at the nav.

import { NextResponse } from "next/server";
import { launchPhase, referralsEnabled } from "@/lib/launch-phase";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    phase: launchPhase(),
    referralsEnabled: referralsEnabled(),
  });
}
