import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { retryFailedRun } from "@/app/actions";
import { Loading, SetupNeeded } from "@/components/nav";
import { ContinuityReportView } from "@/components/reports/continuity-report";
import { IntakeReportView } from "@/components/reports/intake-report";
import { StoryReportView } from "@/components/reports/story-report";
import { StatusBadge } from "@/components/run-bits";
import { RunDriver } from "@/components/run-driver";
import { databaseProblem, getDb, type Db } from "@/lib/db/client";
import type { ContinuityReport } from "@/lib/stages/continuity";
import type { IntakeReport } from "@/lib/stages/intake";
import type { Skipped, StoryReport } from "@/lib/stages/story";
import { loadReview } from "@/lib/ui/queries";
import { loadRun, type RunView, type StageView } from "@/lib/ui/runs";

/** Each step a run takes is a server action on this page; it saves progress well before this limit. */
export const maxDuration = 300;

type Params = Promise<{ id: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

export default function RunPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  return (
    <Suspense fallback={<Loading />}>
      <Run params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Run({ params, searchParams }: { params: Params; searchParams: Search }) {
  await connection();
  const problem = databaseProblem();
  if (problem) return <SetupNeeded problem={problem} />;
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const db = await getDb();
  const run = await loadRun(db, id);
  if (!run) notFound();

  const sp = await searchParams;
  const requested = typeof sp.stage === "string" ? run.stages.find((s) => s.id === sp.stage) : undefined;
  const current = requested ?? run.stages.findLast((s) => s.status === "done") ?? run.stages[0];
  const active = run.status !== "done" && run.status !== "failed";
  const failed = run.stages.find((s) => s.status === "failed");

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col px-6 py-6">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{run.title}</h1>
          <p className="text-sm text-zinc-500">
            {run.inputKind === "story" ? "Story" : "Screenplay"} from {run.sourceName} · started {run.createdAt.slice(0, 16).replace("T", " ")} UTC
          </p>
        </div>
        <StatusBadge status={run.status} />
      </div>

      <div className="mb-4">
        <RunDriver runId={run.id} active={active} />
        {failed && (
          <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            <p className="mb-2">
              {failed.title} stopped: {failed.error}
            </p>
            <form action={retryFailedRun}>
              <input type="hidden" name="id" value={run.id} />
              <button className="rounded border border-red-400 px-3 py-1 dark:border-red-700">Try again</button>
            </form>
          </div>
        )}
      </div>

      <nav className="mb-6 flex flex-wrap gap-1 border-b border-zinc-200 pb-2 text-sm dark:border-zinc-800">
        {run.stages.map((s, i) => (
          <Link
            key={s.id}
            href={`/runs/${run.id}?stage=${s.id}`}
            className={`flex items-center gap-2 rounded-md px-2.5 py-1 ${s.id === current.id ? "bg-zinc-200 dark:bg-zinc-800" : "hover:bg-zinc-100 dark:hover:bg-zinc-900"}`}
          >
            <span className="text-zinc-500 tabular-nums">{i + 1}</span>
            {s.title}
            <StageDot status={s.status} />
          </Link>
        ))}
      </nav>

      <h2 className="mb-1 text-lg font-semibold">{current.title}</h2>
      <p className="mb-5 text-sm text-zinc-500">{current.summary}</p>
      <StageBody stage={current} run={run} db={db} />
    </div>
  );
}

function StageDot({ status }: { status: StageView["status"] }) {
  const tone = { done: "bg-emerald-500", running: "bg-sky-500 animate-pulse", pending: "bg-zinc-300 dark:bg-zinc-700", failed: "bg-red-500" }[status];
  return <span className={`inline-block h-2 w-2 rounded-full ${tone}`} aria-label={status} />;
}

async function StageBody({ stage, run, db }: { stage: StageView; run: RunView; db: Db }): Promise<ReactNode> {
  if (stage.status === "failed") return <p className="text-sm text-red-700 dark:text-red-400">This stage stopped: {stage.error}</p>;
  if (stage.status !== "done" || !stage.report) {
    return <p className="text-sm text-zinc-500">{stage.status === "running" ? `In progress${stage.progress ? `: ${stage.progress}` : ""}…` : "Waiting for earlier stages."}</p>;
  }
  switch (stage.id) {
    case "intake":
      return <IntakeReportView r={stage.report as IntakeReport} scriptText={run.scriptText} />;
    case "story":
      return <StoryReportView r={stage.report as StoryReport | Skipped} />;
    case "continuity": {
      const r = stage.report as ContinuityReport;
      return <ContinuityReportView r={r} review={await loadReview(db, r.docId)} />;
    }
    default:
      return <pre className="text-xs">{JSON.stringify(stage.report, null, 2)}</pre>;
  }
}
