import Link from "next/link";

const LINKS = [
  { href: "/", label: "Review" },
  { href: "/readiness", label: "Readiness report" },
  { href: "/issues", label: "Pipeline health" },
  ...(process.env.NODE_ENV !== "production" ? [{ href: "/eval", label: "Eval" }] : []),
];

export function Nav() {
  return (
    <header className="flex items-center gap-6 border-b border-zinc-200 px-4 py-2.5 print:hidden dark:border-zinc-800">
      <Link href="/" className="font-semibold tracking-tight">
        ReelGraph
      </Link>
      <nav className="flex gap-1 text-sm">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="rounded-md px-2.5 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800">
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

export function EmptyState() {
  return (
    <div className="mx-auto max-w-lg p-10 text-center">
      <h1 className="mb-2 text-xl font-semibold">No script loaded yet</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Run <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">npm run ingest</code> and then{" "}
        <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">npm run checks</code>, then reload this page.
      </p>
    </div>
  );
}

export function Loading() {
  return <p className="p-8 text-sm text-zinc-500">Loading…</p>;
}
