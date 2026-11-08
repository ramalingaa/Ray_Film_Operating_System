import Link from "next/link";

const LINKS = [
  { href: "/", label: "Review" },
  { href: "/readiness", label: "Readiness report" },
  { href: "/impact", label: "Impact" },
  { href: "/issues", label: "Pipeline health" },
  { href: "/load", label: "Load script" },
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
        <Link href="/load" className="underline">
          Load a script
        </Link>{" "}
        in the browser, or run <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">npm run ingest</code> and then{" "}
        <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">npm run checks</code>.
      </p>
    </div>
  );
}

/** Shown instead of a page when the database is not configured for this deployment. */
export function SetupNeeded({ problem }: { problem: string }) {
  return (
    <div className="mx-auto max-w-xl p-10">
      <h1 className="mb-2 text-xl font-semibold">Database not configured</h1>
      <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">{problem}.</p>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
        <li>
          In the Vercel project, open Settings → Environment Variables and add <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">DATABASE_URL</code>{" "}
          for Production (and Preview), using the Supabase <strong>transaction pooler</strong> connection string (port 6543).
        </li>
        <li>Redeploy. Environment variables only apply to deployments made after they are saved.</li>
      </ol>
    </div>
  );
}

export function Loading() {
  return <p className="p-8 text-sm text-zinc-500">Loading…</p>;
}
