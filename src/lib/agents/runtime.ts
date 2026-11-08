/**
 * Agent runtime. An agent is a named, versioned unit of work with typed input
 * and output. The runtime records every run in `agent_runs` and every problem
 * in `pipeline_issues`; agents never swallow errors.
 */
import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { agentRuns, pipelineIssues } from "../db/schema";
import type { ModelGateway } from "../llm/gateway";
import type { Usage } from "../llm/types";

export type IssueSeverity = "error" | "warning" | "info";

export interface RunOutcome {
  model?: string;
  cacheHit?: boolean;
  usage?: Usage;
}

export class Ledger {
  constructor(private readonly db: Db) {}

  start(agent: string, inputRef: string): number {
    const row = this.db.insert(agentRuns).values({ agent, inputRef, status: "running" }).returning({ id: agentRuns.id }).get();
    return row.id;
  }

  finish(runId: number, status: "ok" | "failed" | "skipped", outcome: RunOutcome = {}, error?: string): void {
    this.db
      .update(agentRuns)
      .set({
        status,
        model: outcome.model,
        cacheHit: outcome.cacheHit ?? false,
        inputTokens: outcome.usage?.inputTokens,
        outputTokens: outcome.usage?.outputTokens,
        error,
        finishedAt: new Date().toISOString(),
      })
      .where(eq(agentRuns.id, runId))
      .run();
  }

  issue(stage: string, severity: IssueSeverity, ref: string, message: string): void {
    this.db.insert(pipelineIssues).values({ stage, severity, ref, message }).run();
  }
}

export interface AgentContext {
  db: Db;
  /** Absent when running deterministic-only (no model credentials). */
  gateway?: ModelGateway;
  ledger: Ledger;
}

export interface AgentResult<O> {
  output: O;
  outcome?: RunOutcome;
}

export interface Agent<I, O> {
  readonly name: string;
  readonly version: string;
  run(input: I, ctx: AgentContext): Promise<AgentResult<O>>;
}

/**
 * Run an agent with full bookkeeping. Failures are recorded as a failed run
 * plus an error issue, then rethrown so the orchestrator decides what to do.
 */
export async function runAgent<I, O>(agent: Agent<I, O>, input: I, ctx: AgentContext, inputRef: string): Promise<O> {
  const runId = ctx.ledger.start(`${agent.name}@${agent.version}`, inputRef);
  try {
    const { output, outcome } = await agent.run(input, ctx);
    ctx.ledger.finish(runId, "ok", outcome);
    return output;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.ledger.finish(runId, "failed", {}, message);
    ctx.ledger.issue(agent.name, "error", inputRef, message);
    throw err;
  }
}
