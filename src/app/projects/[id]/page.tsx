import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Loading, SetupNeeded } from "@/components/nav";
import { AgentDriver, StickToBottom } from "@/components/workspace/agent-driver";
import { Artifacts } from "@/components/workspace/artifacts";
import { Composer } from "@/components/workspace/composer";
import { STATUS_DOT, WorkspaceShell } from "@/components/workspace/shell";
import { Timeline } from "@/components/workspace/timeline";
import { databaseProblem, getDb } from "@/lib/db/client";
import { AGENT_STATUS_TEXT, agentStatusOf, loadTimeline, settle } from "@/lib/ui/agent";
import { loadRun } from "@/lib/ui/runs";

/** Each agent turn is a server action on this page; it saves its work well before this limit. */
export const maxDuration = 300;

type Params = Promise<{ id: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

export default function ProjectPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  return (
    <Suspense fallback={<Loading />}>
      <Project params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Project({ params, searchParams }: { params: Params; searchParams: Search }) {
  await connection();
  const problem = databaseProblem();
  if (problem) return <SetupNeeded problem={problem} />;
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const db = await getDb();
  const [run, status] = await Promise.all([loadRun(db, id), agentStatusOf(db, id)]);
  if (!run || !status) notFound();
  const items = settle(await loadTimeline(db, id), status);
  const artifact = (await searchParams).artifact;

  return (
    <WorkspaceShell db={db} selected={id}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-card px-6 py-4 sm:px-8">
        <div className="min-w-0">
          <h1 className="font-display truncate text-[34px] leading-none font-semibold">{run.title}</h1>
          <p className="mt-1.5 text-[13px] text-muted">
            Started from a {run.inputKind} · {run.createdAt.slice(0, 10)}
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full bg-ink px-3.5 py-1.5 text-sm font-semibold text-on-ink">
          <span aria-hidden className={`h-2 w-2 rounded-full ${status === "running" ? "pulse" : ""}`} style={{ background: STATUS_DOT[status] }} />
          Agent: {AGENT_STATUS_TEXT[status]}
        </span>
      </header>

      <div className="flex flex-1 flex-wrap items-start">
        <section aria-label="Agent" className="flex min-w-0 flex-[1_1_420px] flex-col gap-4 px-5 pt-6 pb-6 sm:px-7 xl:max-w-[600px] xl:border-r xl:border-line">
          {items.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">The agent has not started yet. Send it a message to begin.</p>
          ) : (
            <Timeline items={items} />
          )}
          {status === "running" && (
            <p className="ml-10 flex items-center gap-2 text-sm text-fg-2">
              <span aria-hidden className="pulse h-2 w-2 rounded-full bg-gold" /> Working. Keep this page open; it continues from where it stopped when you return.
            </p>
          )}
          <AgentDriver runId={id} active={status === "running"} />
          <StickToBottom count={items.length} />
          <div className="sticky bottom-0 -mx-1 bg-gradient-to-t from-ivory via-ivory to-transparent px-1 pt-6 pb-3">
            <Composer runId={id} status={status} />
          </div>
        </section>

        <section aria-label="Artifacts" className="min-w-0 flex-[1.4_1_520px] self-stretch bg-paper-2/40 px-5 py-6 sm:px-7">
          <Artifacts run={run} db={db} selected={typeof artifact === "string" ? artifact : undefined} />
        </section>
      </div>
    </WorkspaceShell>
  );
}
