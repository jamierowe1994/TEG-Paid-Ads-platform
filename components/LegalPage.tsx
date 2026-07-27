import Link from "next/link";

/* Shared shell for the Terms and Privacy pages. Deliberately plain and light
   rather than following the landing page's dark theme — these are documents
   people read and occasionally print, not marketing. */
export default function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-white text-gray-900">
      <header className="border-b border-gray-100">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-6">
          <Link href="/" className="text-sm font-semibold">
            Launch Pad
          </Link>
          <Link
            href="/"
            className="text-sm text-gray-500 transition hover:text-gray-900"
          >
            Back to site
          </Link>
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-4xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-3 text-sm text-gray-500">Last updated {updated}</p>

        {/* Space the prose out here rather than repeating classes on every
            paragraph in the documents themselves. */}
        <div className="legal mt-12">{children}</div>
      </article>

      <footer className="border-t border-gray-100">
        <div className="mx-auto flex max-w-3xl flex-col gap-2 px-6 py-8 text-xs text-gray-400 sm:flex-row sm:justify-between">
          <span>© {new Date().getFullYear()} The Experts Group</span>
          <div className="flex gap-6">
            <Link href="/privacy" className="hover:text-gray-600">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-gray-600">
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
