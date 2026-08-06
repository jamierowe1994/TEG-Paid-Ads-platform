import Link from "next/link";
import { peekAuthToken } from "@/lib/auth-tokens";
import { findById } from "@/lib/users-store";
import { referralsEnabled } from "@/lib/launch-phase";
import ResetForm from "./ResetForm";

/* Landing page for both link types. The token is checked on the SERVER before
   anything renders, so an expired or spent link shows an honest dead end
   rather than a form that fails on submit. */
export default async function ResetPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ invite?: string }>;
}) {
  const { token } = await params;
  const { invite } = await searchParams;
  const purpose = invite ? "invite" : "reset";

  const userId = await peekAuthToken(token, purpose);
  const user = userId ? await findById(userId) : null;

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white px-6">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            This link has expired
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-gray-500">
            Reset links can only be used once, and they don&apos;t last
            forever. Ask for a new one and we&apos;ll send it straight over.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-block rounded-xl bg-gray-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-gray-700"
          >
            Back to sign in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <ResetForm
      token={token}
      purpose={purpose}
      name={user.name}
      email={user.email}
      referralsOpen={referralsEnabled()}
    />
  );
}
