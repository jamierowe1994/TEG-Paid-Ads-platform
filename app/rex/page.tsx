// What someone sees inside the Rex iframe when the embed sign-in doesn't land.
//
// Deliberately plain and self-contained: it renders in a small panel inside
// Rex, so there's no room for the usual chrome, and the person reading it is
// mid-task in another application. Each message says what happened and who can
// fix it — "something went wrong" would just generate a phone call.

const MESSAGES: Record<
  string,
  { title: string; body: string; who?: string }
> = {
  disabled: {
    title: "Not switched on yet",
    body: "Launch Pad inside Rex isn't live yet. You can still sign in to Launch Pad directly in a browser.",
    who: "Nothing to do — this is turned on centrally.",
  },
  "no-token": {
    title: "Rex didn't pass a sign-in token",
    body: "This usually means the embedded app's URL is missing the token placeholder.",
    who: "Whoever set up the embedded app in Rex needs to check its URL.",
  },
  rejected: {
    title: "Rex didn't recognise that session",
    body: "Your Rex sign-in may have expired. Refreshing Rex and reopening this tab normally sorts it.",
  },
  "rex-unreachable": {
    title: "Couldn't reach Rex",
    body: "We couldn't check who you are because Rex didn't answer. This is usually temporary — try again shortly.",
  },
  "no-account": {
    title: "No Launch Pad account for you yet",
    body: "You're signed in to Rex, but there's no Launch Pad account using the same email address.",
    who: "Ask head office to set one up — they'll need the email your Rex account uses.",
  },
  "service-account": {
    title: "That's the integration login",
    body: "This is the account Launch Pad uses to talk to Rex, not a person's account, so it can't be signed in this way.",
    who: "Open Launch Pad with your own Rex login.",
  },
  deactivated: {
    title: "That account is closed",
    body: "This Launch Pad account has been deactivated, so it can't be opened.",
    who: "Speak to head office if that's not right.",
  },
};

export default async function RexEmbedStatus({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const m = MESSAGES[status ?? ""] ?? {
    title: "Something didn't work",
    body: "We couldn't open Launch Pad from Rex.",
    who: "If it keeps happening, let head office know.",
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-gray-900">{m.title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">{m.body}</p>
        {m.who && <p className="mt-3 text-xs text-gray-400">{m.who}</p>}
      </div>
    </main>
  );
}
