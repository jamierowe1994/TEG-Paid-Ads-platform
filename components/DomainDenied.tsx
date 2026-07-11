"use client";

// Shown when someone tries to sign up or sign in with an email that isn't on
// one of the Experts Group domains. The portal is staff-only, so we decline
// them here (with a GIF) rather than letting them pay for a service we can't
// provide.
export default function DomainDenied({
  email,
  actionLabel = "Try a different email",
  onAction,
}: {
  email?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="fade-up text-center">
      <div className="mx-auto max-w-xs overflow-hidden rounded-2xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/sorry.gif"
          alt="So sorry"
          className="h-auto w-full object-cover"
        />
      </div>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">
        So sorry — this one&apos;s staff only
      </h1>
      <p className="mx-auto mt-3 max-w-md text-gray-500">
        {email ? (
          <>
            <span className="font-medium text-gray-700">{email}</span> isn&apos;t
            an Experts Group email.{" "}
          </>
        ) : null}
        Only people with an <span className="font-medium">Experts Group</span>{" "}
        work email can sign in to this platform. If you&apos;re part of the
        Experts Group, use your work email — e.g.
        yourname@therecruitmentexperts.co.uk.
      </p>
      {onAction && (
        <button
          onClick={onAction}
          className="mt-7 rounded-xl border border-gray-200 px-6 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
