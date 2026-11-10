import Link from "next/link";
import { StarMark } from "@/components/journey/stage-look";

const LINKS = [
  { href: "/projects", label: "Projects" },
  { href: "/issues", label: "Pipeline health" },
  ...(process.env.NODE_ENV !== "production" ? [{ href: "/eval", label: "Eval" }] : []),
];

/** Kept for older pages that still import it. */
export function Star({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M12 1.5c.5 4.9 2.6 8 7.5 8.5-4.9.5-7 3.6-7.5 8.5-.5-4.9-2.6-8-7.5-8.5 4.9-.5 7-3.6 7.5-8.5Z" />
    </svg>
  );
}

export function Nav() {
  return (
    <header className="bg-ink px-6 text-on-ink sm:px-8 print:hidden">
      <div className="mx-auto flex min-h-[68px] max-w-[1320px] flex-wrap items-center justify-between gap-x-6 gap-y-2 py-2">
        <Link href="/" className="flex items-center gap-2.5 text-on-ink no-underline">
          <StarMark size={22} className="text-gold-bright" />
          <span className="font-display text-[26px] font-semibold tracking-[0.01em]">Ray Studio</span>
        </Link>
        <nav aria-label="Main" className="flex flex-wrap items-center gap-1">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-full px-3.5 py-2.5 text-sm text-on-ink-2 no-underline transition hover:bg-white/10 hover:text-on-ink">
              {l.label}
            </Link>
          ))}
          <Link href="/projects" className="btn-gold ml-2 min-h-10! px-4.5! text-sm!">
            New project
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function EmptyState() {
  return (
    <div className="mx-auto max-w-lg p-12 text-center">
      <StarMark size={32} className="mx-auto mb-3 text-gold" />
      <h1 className="font-display mb-2 text-4xl font-semibold">Nothing here yet</h1>
      <p className="text-fg-2">
        <Link href="/projects" className="font-semibold text-gold-deep underline underline-offset-4">
          Start a production
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
      <h1 className="font-display mb-2 text-4xl font-semibold">Database not configured</h1>
      <p className="mb-4 text-fg-2">{problem}.</p>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-fg-2">
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
      <StarMark size={16} className="pulse text-gold" /> Loading…
    </p>
  );
}
