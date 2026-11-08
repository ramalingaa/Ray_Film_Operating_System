import Link from "next/link";

const LINKS = [
  { href: "/", label: "Productions" },
  { href: "/review", label: "Script review" },
  { href: "/impact", label: "Impact" },
  { href: "/issues", label: "Pipeline health" },
  ...(process.env.NODE_ENV !== "production" ? [{ href: "/eval", label: "Eval" }] : []),
];

/** A small four-pointed star, the app's mark. */
export function Star({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M12 1.5c.5 4.9 2.6 8 7.5 8.5-4.9.5-7 3.6-7.5 8.5-.5-4.9-2.6-8-7.5-8.5 4.9-.5 7-3.6 7.5-8.5Z" />
      <path d="M19.5 15.5c.2 1.8 1 3 2.5 3.2-1.5.2-2.3 1.4-2.5 3.3-.2-1.9-1-3.1-2.5-3.3 1.5-.2 2.3-1.4 2.5-3.2Z" opacity=".7" />
    </svg>
  );
}

export function Nav() {
  return (
    <header className="night-sky flex flex-wrap items-center gap-x-8 gap-y-1 px-5 py-3 print:hidden">
      <Link href="/" className="flex items-center gap-2">
        <Star className="h-5 w-5 text-[#f2d27e]" />
        <span className="font-display text-2xl font-semibold tracking-wide">ReelGraph</span>
      </Link>
      <nav className="flex flex-wrap gap-1 text-sm">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="rounded-full px-3 py-1 text-[#e9e2f7] transition hover:bg-white/10 hover:text-white">
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

export function EmptyState() {
  return (
    <div className="mx-auto max-w-lg p-12 text-center">
      <Star className="mx-auto mb-3 h-8 w-8 text-gold" />
      <h1 className="font-display mb-2 text-3xl font-semibold">Nothing here yet</h1>
      <p className="text-ink-soft">
        <Link href="/" className="text-gold underline underline-offset-4">
          Begin a production
        </Link>{" "}
        from a story or a screenplay.
      </p>
    </div>
  );
}

/** Shown instead of a page when the database is not configured for this deployment. */
export function SetupNeeded({ problem }: { problem: string }) {
  return (
    <div className="mx-auto max-w-xl p-10">
      <h1 className="font-display mb-2 text-3xl font-semibold">Database not configured</h1>
      <p className="mb-4 text-ink-soft">{problem}.</p>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-soft">
        <li>
          In the Vercel project, open Settings → Environment Variables and add <code className="rounded bg-paper-2 px-1">DATABASE_URL</code> for Production (and
          Preview), using the Supabase <strong>transaction pooler</strong> connection string (port 6543).
        </li>
        <li>Redeploy. Environment variables only apply to deployments made after they are saved.</li>
      </ol>
    </div>
  );
}

export function Loading() {
  return (
    <p className="flex items-center gap-2 p-10 text-muted">
      <Star className="h-4 w-4 animate-pulse text-gold" /> Turning the page…
    </p>
  );
}
