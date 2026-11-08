/**
 * Runs: create one from an upload or pasted text, and advance it one step at a
 * time. A step holds a short lease on the run, executes stages in order until
 * its time budget is spent, and saves each stage's progress or report. Any
 * error fails that stage (recorded, never swallowed) and stops the run until
 * it is retried.
 */
import { and, asc, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { Ledger, type AgentContext } from "../agents/runtime";
import type { JudgeSettings } from "../checks/judge";
import type { Db } from "../db/client";
import { runs, runStages, type RunStage } from "../db/schema";
import { classifyInput } from "../intake/classify";
import type { ModelGateway } from "../llm/gateway";
import { STAGES } from "../stages";
import { CHAPTERS, LAST_CHAPTER, runnableStages } from "../stages/chapters";
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
      // A story starts at chapter I. A screenplay starts at chapter II, with chapter I marked skipped.
      storyText: c.kind === "story" ? text : null,
      scriptText: c.kind === "screenplay" ? text : null,
      scriptMode: c.kind === "screenplay" ? "own" : null,
      approvedThrough: c.kind === "screenplay" ? 0 : -1,
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

/**
 * busy: another step holds the run. progress: more to do now. awaiting: a
 * chapter needs the user's input. review: everything unlocked is done and
 * waits for approval. done: the production is greenlit. failed: a stage failed.
 */
export type StepOutcome = { state: "busy" } | { state: "progress" | "awaiting" | "review" | "done" | "failed"; stage?: string };

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
    const allowed = new Set(runnableStages(run.approvedThrough));
    for (const def of STAGES) {
      if (!allowed.has(def.id)) continue;
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
              : { status: "running", progress: r.progress ?? r.awaiting ?? null },
          )
          .where(eq(runStages.id, row.id));
        outcome = { state: r.awaiting ? "awaiting" : "progress", stage: def.id };
        if (!r.done) break;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await db.update(runStages).set({ status: "failed", error: message, finishedAt: now() }).where(eq(runStages.id, row.id));
        await ctx.ledger.issue(`stage:${def.id}`, "error", `run ${runId}`, message);
        outcome = { state: "failed", stage: def.id };
        break;
      }
    }
    if (outcome.state !== "failed" && outcome.state !== "awaiting") {
      const after = await db.select({ stage: runStages.stage, status: runStages.status }).from(runStages).where(eq(runStages.runId, runId));
      const unlockedDone = after.filter((r) => allowed.has(r.stage)).every((r) => r.status === "done");
      if (unlockedDone) outcome = { state: run.approvedThrough >= LAST_CHAPTER ? "done" : "review" };
    }
  } finally {
    // "done" on the run means nothing can run until the user acts (or the production is greenlit).
    const status = outcome.state === "failed" ? "failed" : outcome.state === "progress" ? "running" : "done";
    await db.update(runs).set({ lockedUntil: null, status, updatedAt: now() }).where(eq(runs.id, runId));
  }
  return outcome;
}

/** Reset a failed stage (and the run) so the next step tries it again. */
export async function retryRun(db: Db, runId: number): Promise<void> {
  await db.update(runStages).set({ status: "pending", error: null, progress: null }).where(and(eq(runStages.runId, runId), eq(runStages.status, "failed")));
  await db.update(runs).set({ status: "running", updatedAt: now() }).where(eq(runs.id, runId));
}

/** Step until the run needs the user (review, awaiting), is greenlit, or fails. */
export async function runToEnd(db: Db, runId: number, opts: StepOptions, maxSteps = 100): Promise<StepOutcome> {
  let o: StepOutcome = { state: "progress" };
  for (let i = 0; i < maxSteps; i++) {
    o = await stepRun(db, runId, opts);
    if (o.state !== "progress" && o.state !== "busy") return o;
  }
  return o;
}

/**
 * Take a production all the way through (CLI and tests): approve each chapter
 * as soon as it is ready, and write the screenplay from the story when asked.
 */
export async function autopilot(db: Db, runId: number, opts: StepOptions, maxSteps = 200): Promise<StepOutcome> {
  for (let i = 0; i < maxSteps; i++) {
    const o = await runToEnd(db, runId, opts);
    if (o.state === "done" || o.state === "failed" || o.state === "busy") return o;
    const run = await getRun(db, runId);
    if (o.state === "awaiting") {
      if (!run.storyText) return o;
      await writeScriptFromStory(db, runId);
    } else if (o.state === "review") {
      await approveChapter(db, runId, run.approvedThrough + 1);
    }
  }
  return { state: "progress" };
}

// ---- chapter actions --------------------------------------------------------------

async function resetStages(db: Db, runId: number, stages: RunStage[]): Promise<void> {
  if (!stages.length) return;
  await db
    .update(runStages)
    .set({ status: "pending", reportJson: null, error: null, progress: null, startedAt: null, finishedAt: null })
    .where(and(eq(runStages.runId, runId), inArray(runStages.stage, stages)));
}

async function getRun(db: Db, runId: number): Promise<RunRow> {
  const [run] = await db.select().from(runs).where(eq(runs.id, runId));
  if (!run) throw new Error(`production ${runId} not found`);
  return run;
}

function requireOpen(run: RunRow, chapter: number, what: string) {
  if (run.approvedThrough >= chapter) throw new Error(`${CHAPTERS[chapter].title} is locked. Reopen it to ${what}.`);
  if (run.approvedThrough < chapter - 1) throw new Error(`${CHAPTERS[chapter].title} is not unlocked yet.`);
}

/** Approve chapter `index` (the next unapproved one, with all its stages done). */
export async function approveChapter(db: Db, runId: number, index: number): Promise<void> {
  const run = await getRun(db, runId);
  if (index !== run.approvedThrough + 1) throw new Error("Chapters are approved in order.");
  const rows = await db.select().from(runStages).where(eq(runStages.runId, runId));
  const pending = CHAPTERS[index].stages.filter((st) => rows.find((r) => r.stage === st)?.status !== "done");
  if (pending.length) throw new Error(`${CHAPTERS[index].title} is not finished yet.`);
  await db.update(runs).set({ approvedThrough: index, status: index >= LAST_CHAPTER ? "done" : "running", updatedAt: now() }).where(eq(runs.id, runId));
}

/** Reopen chapter `index`: it and every later chapter become unapproved, and later chapters' work is cleared. */
export async function reopenChapter(db: Db, runId: number, index: number): Promise<void> {
  const run = await getRun(db, runId);
  if (index > run.approvedThrough) return;
  if (index === 0 && !run.storyText) throw new Error("This production started from a screenplay; there is no story chapter to reopen.");
  await resetStages(db, runId, CHAPTERS.slice(index + 1).flatMap((c) => c.stages));
  await db.update(runs).set({ approvedThrough: index - 1, status: "done", updatedAt: now() }).where(eq(runs.id, runId));
}

/** Replace the story text (chapter I) and test it again. */
export async function updateStory(db: Db, runId: number, text: string): Promise<void> {
  const run = await getRun(db, runId);
  requireOpen(run, 0, "edit the story");
  if (!text.trim()) throw new Error("The story is empty.");
  await resetStages(db, runId, CHAPTERS[0].stages);
  // A screenplay written from the old story is out of date.
  const patch = run.scriptMode === "adapt" ? { scriptText: null, scriptGenerated: false } : {};
  await db.update(runs).set({ storyText: text, ...patch, status: "running", updatedAt: now() }).where(eq(runs.id, runId));
}

/** Provide (or replace) the screenplay for chapter II and test it. */
export async function setScript(db: Db, runId: number, text: string): Promise<void> {
  const run = await getRun(db, runId);
  requireOpen(run, 1, "change the screenplay");
  if (!text.trim()) throw new Error("The screenplay is empty.");
  await resetStages(db, runId, CHAPTERS[1].stages);
  await db.update(runs).set({ scriptText: text, scriptMode: "own", scriptGenerated: false, status: "running", updatedAt: now() }).where(eq(runs.id, runId));
}

/** Have chapter II's screenplay written from the approved story. */
export async function writeScriptFromStory(db: Db, runId: number): Promise<void> {
  const run = await getRun(db, runId);
  requireOpen(run, 1, "rewrite the screenplay");
  if (!run.storyText) throw new Error("There is no story to write from.");
  await resetStages(db, runId, CHAPTERS[1].stages);
  await db.update(runs).set({ scriptText: null, scriptMode: "adapt", scriptGenerated: false, status: "running", updatedAt: now() }).where(eq(runs.id, runId));
}
