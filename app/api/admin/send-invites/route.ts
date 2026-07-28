import { NextRequest, NextResponse } from "next/server";
import { adminScope } from "@/lib/admin-auth";
import { listUsers, findById } from "@/lib/users-store";
import { createAuthToken } from "@/lib/auth-tokens";
import { sendSystemEmail, systemMailboxConnected } from "@/lib/mailer";
import { inviteEmail } from "@/lib/emails";
import { appOrigin } from "@/lib/microsoft";
import { brandById } from "@/lib/brands";

const TTL_DAYS = 14;

/* Send invite emails to pre-provisioned accounts.
 * Body: { userIds?: string[] }  — omit to send to everyone still pending.
 *
 * "Pending" means mustResetPassword is still set: the account was bulk
 * imported and has never had its own password. That's the same flag the
 * first-sign-in gate uses, so this can't email someone already set up.
 *
 * Sends are sequential rather than in parallel: a few hundred simultaneous
 * Graph calls would hit throttling and we'd have no idea which ones landed.
 * The response reports per-recipient, so a partial failure is visible instead
 * of silent.
 *
 * Both admin tiers can send. An MD is confined to their OWN brand — enforced
 * here on the server, by intersecting the target list with their brandId,
 * rather than trusting the ids the client passed up.
 */
export async function POST(req: NextRequest) {
  const scope = adminScope(req);
  if (!scope) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  if (!(await systemMailboxConnected())) {
    return NextResponse.json(
      { error: "Connect the system mailbox first (Connections tab)." },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const requested: string[] | undefined = Array.isArray(body?.userIds)
    ? body.userIds.map(String)
    : undefined;

  const all = await listUsers();
  const targets = all.filter(
    (u) =>
      u.mustResetPassword &&
      !u.deactivatedAt &&
      (!requested || requested.includes(u.id)) &&
      // An MD can only ever invite their own people, whatever they asked for.
      (scope.role === "super" || u.brandId === scope.brandId)
  );

  if (!targets.length) {
    return NextResponse.json({ ok: true, sent: 0, results: [] });
  }

  const results: { email: string; sent: boolean; reason?: string }[] = [];
  for (const target of targets) {
    const user = await findById(target.id);
    if (!user) continue;

    const token = await createAuthToken(user.id, "invite", TTL_DAYS * 86_400_000);
    const link = `${appOrigin()}/reset/${token}?invite=1`;
    const mail = inviteEmail({
      name: user.name,
      link,
      brandName: brandById(user.brandId)?.name ?? "The Experts Group",
      days: TTL_DAYS,
    });
    const res = await sendSystemEmail({
      to: user.email,
      subject: mail.subject,
      body: mail.html,
      html: true,
    });
    results.push(
      res.sent
        ? { email: user.email, sent: true }
        : { email: user.email, sent: false, reason: res.reason }
    );
  }

  return NextResponse.json({
    ok: true,
    sent: results.filter((r) => r.sent).length,
    failed: results.filter((r) => !r.sent).length,
    results,
  });
}
