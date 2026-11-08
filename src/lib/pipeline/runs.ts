/**
 * Runs: create one from an upload or pasted text, and advance it one step at a
 * time. A step holds a short lease on the run, executes stages in order until
 * its time budget is spent, and saves each stage's progress or report. Any
 * error fails that stage (recorded, never swallowed) and stops the run until
 * it is retried.
 */
import { and, asc, eq, isNull, lt, or } from "drizzle-orm";
import { Ledger, type AgentContext } from "../agents/runtime";
import type { JudgeSettings } from "../checks/judge";
import type { Db } from "../db/client";
import { runs, runStages } from "../db/schema";
import { classifyInput } from "../intake/classify";
import type { ModelGateway } from "../llm/gateway";
import { STAGES } from "../stages";
import type { RunRow } from "../stages/types";

const now = () => new Date().toISOString();

export interface NewRunInput {
  title?: string;
  sourceName: string;
  text: string;
  costumes?: { name: string; text: string };
  locations?: { name: string; text: string };
}

export const MAX_INPUT_CHARS = 600_000;

export async function createRun(db: Db, input: NewRunInput): Promise<number> {
  const text = input.text.replace(/^﻿/, "");
  if (!text.trim()) throw new Error("The script or story is empty.");
  if (text.length > MAX_INPUT_CHARS) throw new Error(`The input is too long (${text.length.toLocaleString()} characters; the limit is ${MAX_INPUT_CHARS.toLocaleString()}).`);
  const c = classifyInput(text, input.sourceName);
  const title = input.title?.trim() || c.parsed?.titlePage.title?.trim() || input.sourceName.replace(/\.[a-z0-9]+$/i, "") || "Untitled";
  const [row] = await db
    .insert(runs)
    .values({
      title,
      inputKind: c.kind,
      sourceName: input.sourceName,
      inputText: text,
      costumesName: input.costumes?.name,
      costumesText: input.costumes?.text,
      locationsName: input.locations?.name,
      locationsText: input.locations?.text,
      updatedAt: now(),
    })
    .returning({ id: runs.id });
  await ensureStages(db, row.id);
  return row.id;
}

/** Add any stage rows a run is missing (runs created before a stage existed get it too). */
export async function ensureStages(db: Db, runId: number): Promise<void> {
  await db
    .insert(runStages)
    .values(STAGES.map((s, i) => ({ runId, stage: s.id, ordinal: i })))
    .onConflictDoNothing({ target: [runStages.runId, runStages.stage] });
}

export interface StepOptions {
  gateway?: ModelGateway;
  judgeSettings: JudgeSettings;
  /** How long this step may work before saving progress. Keep well under the host's request limit. */
  budgetMs?: number;
}

export type StepOutcome = { state: "busy" } | { state: "progress" | "done" | "failed"; stage?: string };

/** Take a lease on the run, or return undefined if another step holds it. */
async function lease(db: Db, runId: number, ms: number): Promise<RunRow | undefined> {
  const t = Date.now();
  const [row] = await db
    .update(runs)
    .set({ lockedUntil: t + ms, status: "running", updatedAt: now() })
    .where(and(eq(runs.id, runId), or(isNull(runs.lockedUntil), lt(runs.lockedUntil, t))))
    .returning();
  return row;
}

export async function stepRun(db: Db, runId: number, opts: StepOptions): Promise<StepOutcome> {
  const budget = opts.budgetMs ?? 200_000;
  let run = await lease(db, runId, budget + 60_000);
  if (!run) return { state: "busy" };
  const deadline = Date.now() + budget;
  const ctx: AgentContext = { db, ledger: new Ledger(db), gateway: opts.gateway };
  let outcome: StepOutcome = { state: "progress" };
  try {
    await ensureStages(db, runId);
    const rows = await db.select().from(runStages).where(eq(runStages.runId, runId)).orderBy(asc(runStages.ordinal));
    let attempted = false;
    for (const def of STAGES) {
      const row = rows.find((r) => r.stage === def.id);
      if (!row || row.status === "done") continue;
      if (row.status === "failed") {
        outcome = { state: "failed", stage: def.id };
        break;
      }
      // Every step attempts at least one stage, so a run always moves forward.
      if (attempted && Date.now() > deadline) break;
      attempted = true;
      await db.update(runStages).set({ status: "running", startedAt: row.startedAt ?? now() }).where(eq(runStages.id, row.id));
      try {
        const r = await def.step({ ctx, run, judgeSettings: opts.judgeSettings, deadline });
        if (r.runPatch) {
          [run] = await db.update(runs).set({ ...r.runPatch, updatedAt: now() }).where(eq(runs.id, runId)).returning();
        }
        await db
          .update(runStages)
          .set(
            r.done
              ? { status: "done", progress: null, reportJson: JSON.stringify(r.report ?? null), finishedAt: now(), error: null }
              : { status: "running", progress: r.progress ?? null },
          )
          .where(eq(runStages.id, row.id));
        outcome = { state: "progress", stage: def.id };
        if (!r.done) break;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await db.update(runStages).set({ status: "failed", error: message, finishedAt: now() }).where(eq(runStages.id, row.id));
        await ctx.ledger.issue(`stage:${def.id}`, "error", `run ${runId}`, message);
        outcome = { state: "failed", stage: def.id };
        break;
      }
    }
    if (outcome.state !== "failed") {
      const after = await db.select({ status: runStages.status }).from(runStages).where(eq(runStages.runId, runId));
      if (after.every((r) => r.status === "done")) outcome = { state: "done" };
    }
  } finally {
    const status = outcome.state === "done" ? "done" : outcome.state === "failed" ? "failed" : "running";
    await db.update(runs).set({ lockedUntil: null, status, updatedAt: now() }).where(eq(runs.id, runId));
  }
  return outcome;
}

/** Reset a failed stage (and the run) so the next step tries it again. */
export async function retryRun(db: Db, runId: number): Promise<void> {
  await db.update(runStages).set({ status: "pending", error: null, progress: null }).where(and(eq(runStages.runId, runId), eq(runStages.status, "failed")));
  await db.update(runs).set({ status: "running", updatedAt: now() }).where(eq(runs.id, runId));
}

/** Run a run to completion (CLI and tests). */
export async function runToEnd(db: Db, runId: number, opts: StepOptions, maxSteps = 100): Promise<StepOutcome> {
  let o: StepOutcome = { state: "progress" };
  for (let i = 0; i < maxSteps; i++) {
    o = await stepRun(db, runId, opts);
    if (o.state === "done" || o.state === "failed") return o;
  }
  return o;
}
