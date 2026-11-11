import Link from "next/link";
import { Check, ExternalLink, LoaderCircle } from "lucide-react";
import { STAGE_LOOK, StarMark } from "@/components/journey/stage-look";
import { StageReport } from "@/components/stage-report";
import type { Db } from "@/lib/db/client";
import type { RunView, StageView } from "@/lib/ui/runs";
import { summaryOf, TEST_LABEL } from "@/lib/ui/summaries";

const STATE_TEXT: Record<string, string> = {
  approved: "Approved",
  ready: "Ready",
  working: "Working",
  awaiting_input: "Your move",
  failed: "Failed",
  locked: "Locked",
  skipped: "Skipped",
};

/**
 * What the agent has produced so far: the six chapters with their state, and
 * every finished report, newest chapter first by default.
 */
export async function Artifacts({ run, db, selected }: { run: RunView; db: Db; selected?: string }) {
  const done = run.stages.filter((s) => s.status === "done" && s.report);
  const current: StageView | undefined = done.find((s) => s.id === selected) ?? done.at(-1);

  return (
    <div className="flex flex-col gap-5">
      <section aria-label="Chapters" className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="eyebrow text-muted">Production</p>
          {run.greenlit && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-bright px-2.5 py-1 text-xs font-semibold text-[#1F1703]">
              <StarMark size={12} /> Greenlit
            </span>
          )}
        </div>
        <ol className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {run.chapters.map((c) => {
            const look = STAGE_LOOK[c.id];
            const on = c.state !== "locked" && c.state !== "skipped";
            return (
              <li key={c.id} className="flex items-center gap-2.5 rounded-xl border px-3 py-2.5" style={{ borderColor: on ? `${look.base}55` : "var(--line)", background: c.state === "approved" ? look.soft : "transparent" }}>
                <span className="inline-flex h-7 w-7 flex-none items-center justify-center rounded-lg text-white" style={{ background: on ? look.base : "#CFC6B1" }}>
                  {c.state === "approved" ? <Check aria-hidden size={15} strokeWidth={2.6} /> : c.state === "working" ? <LoaderCircle aria-hidden size={15} className="spin" /> : <look.Icon aria-hidden size={15} />}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold">{c.title}</span>
                  <span className="block truncate text-xs" style={{ color: c.state === "failed" ? "var(--rose)" : "var(--muted)" }}>
                    {STATE_TEXT[c.state] ?? c.state}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
        <Link href={`/runs/${run.id}`} className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-gold-deep">
          Open the chapter-by-chapter view <ExternalLink aria-hidden size={13} />
        </Link>
      </section>

      {current ? (
        <section aria-label="Reports" className="flex flex-col gap-4">
          <nav aria-label="Reports" className="flex flex-wrap gap-1.5">
            {done.map((s) => (
              <Link
                key={s.id}
                href={`/projects/${run.id}?artifact=${s.id}`}
                scroll={false}
                aria-current={s.id === current.id ? "page" : undefined}
                title={summaryOf(s)}
                className={`rounded-full border px-3.5 py-1.5 text-[13px] font-semibold no-underline transition ${s.id === current.id ? "border-fg bg-fg text-ivory" : "border-line bg-card text-fg hover:border-gold"}`}
              >
                {TEST_LABEL[s.id] ?? s.title}
              </Link>
            ))}
          </nav>
          <div className="min-w-0 overflow-x-auto">
            <StageReport stage={current} run={run} db={db} />
          </div>
        </section>
      ) : (
        <section className="rounded-[22px] border border-dashed border-line px-6 py-12 text-center text-fg-2">
          <p className="font-display text-[26px] font-semibold text-fg">Reports appear here</p>
          <p className="mt-1.5 text-sm">Each report shows up as soon as the agent finishes that stage.</p>
        </section>
      )}
    </div>
  );
}
