/**
 * The project agent's tools. Each wraps an existing, tested piece of the
 * pipeline (stage steps, chapter gates, story and script edits), so the agent
 * decides what to do next while the deterministic code still does the work
 * and keeps every citation. A tool never throws: failures come back as
 * `{ error }` for the model to read, and are logged as pipeline issues.
 */
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { Ledger } from "../agents/runtime";
import type { JudgeSettings } from "../checks/judge";
import type { Db } from "../db/client";
import { agentEvents } from "../db/schema";
import type { ModelGateway } from "../llm/gateway";
import type { ToolSpec } from "../llm/types";
import { approveChapter, reopenChapter, retryRun, stepRun, updateStory, writeScriptFromStory } from "../pipeline/runs";
import { CHAPTERS } from "../stages/chapters";
import { loadRun, type RunView } from "../ui/runs";
import { summaryOf, TEST_LABEL } from "../ui/summaries";

export interface ToolEnv {
  db: Db;
  runId: number;
  /** Models for the stages (extraction, judging, adaptation). Absent: deterministic stages only. */
  gateway?: ModelGateway;
  judgeSettings: JudgeSettings;
  /** Epoch ms when the current agent turn must stop starting work. */
  deadline: number;
}

export interface ToolOutcome {
  /** One line for people (the timeline). */
  summary: string;
  /** What the model reads back. */
  output: unknown;
  /** wait: hand the turn to the user. finish: the job is done. */
  control?: "wait" | "finish";
  ok: boolean;
}

interface AgentTool<S extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  schema: S;
  /** `ok: false` marks a call that ran but did not succeed (e.g. a stage failed). */
  run(input: z.infer<S>, env: ToolEnv): Promise<Omit<ToolOutcome, "ok"> & { ok?: boolean }>;
}

const CHAPTER_IDS = CHAPTERS.map((c) => c.id) as [string, ...string[]];
const chapterIndex = (id: string) => CHAPTERS.findIndex((c) => c.id === id);
const MAX_STORY_REVISIONS = 2;
const REPORT_CHARS = 9000;
const DOC_LINES = 250;

/** The project as the agent sees it: chapters, stages, and what each finished stage found. */
export function statusOf(run: RunView) {
  return {
    title: run.title,
    started_from: run.inputKind,
    has_story: !!run.storyText,
    has_screenplay: !!run.scriptText,
    screenplay_source: run.scriptMode === "adapt" ? "written from the story" : run.scriptMode === "own" ? "provided by the user" : null,
    greenlit: run.greenlit,
    current_chapter: run.greenlit ? null : run.chapters[run.currentChapter].id,
    chapters: run.chapters.map((c) => ({
      id: c.id,
      title: c.title,
      state: c.state,
      note: c.note,
      stages: c.stageViews.map((s) => ({
        stage: s.id,
        name: TEST_LABEL[s.id] ?? s.title,
        status: s.status,
        ...(s.progress ? { progress: s.progress } : {}),
        ...(s.error ? { error: s.error } : {}),
        ...(s.status === "done" ? { result: summaryOf(s) } : {}),
      })),
    })),
  };
}

async function mustLoad(env: ToolEnv): Promise<RunView> {
  const run = await loadRun(env.db, env.runId);
  if (!run) throw new Error(`project ${env.runId} not found`);
  return run;
}

function numbered(text: string, from: number, to: number) {
  const lines = text.split("\n");
  const start = Math.max(1, from);
  const end = Math.min(lines.length, to, start + DOC_LINES - 1);
  return {
    total_lines: lines.length,
    from_line: start,
    to_line: end,
    text: lines
      .slice(start - 1, end)
      .map((l, i) => `${String(start + i).padStart(4)}| ${l}`)
      .join("\n"),
  };
}

const tool = <S extends z.ZodType>(t: AgentTool<S>) => t as unknown as AgentTool;

export const TOOLS: AgentTool[] = [
  tool({
    name: "get_status",
    description: "See the whole project: each chapter's state (locked, working, awaiting_input, ready, approved, skipped, failed), its stages and a one-line result for each finished stage. Call this first and whenever you are unsure what to do next.",
    schema: z.object({}),
    async run(_input, env) {
      const run = await mustLoad(env);
      const cur = run.greenlit ? "greenlit" : `${run.chapters[run.currentChapter].title}: ${run.chapters[run.currentChapter].state.replace("_", " ")}`;
      return { summary: `Checked the project (${cur})`, output: statusOf(run) };
    },
  }),

  tool({
    name: "run_current_chapter",
    description:
      "Run the tests of the current chapter (the first one not yet approved). Long stages save progress and return before finishing, so call it again while the chapter's state is still 'working'. Returns the chapter's state and the result of every stage that finished.",
    schema: z.object({}),
    async run(_input, env) {
      const before = await mustLoad(env);
      const budgetMs = Math.max(20_000, env.deadline - Date.now() - 15_000);
      const o = await stepRun(env.db, env.runId, { gateway: env.gateway, judgeSettings: env.judgeSettings, budgetMs });
      const run = await mustLoad(env);
      if (o.state === "busy") return { summary: "Another step is already running on this project", output: { state: "busy", hint: "Wait, then call get_status." } };
      const finished = run.stages.filter((s) => s.status === "done" && before.stages.find((b) => b.id === s.id)?.status !== "done");
      const chapter = run.chapters[run.currentChapter];
      const lines = finished.map((s) => `${TEST_LABEL[s.id] ?? s.title}: ${summaryOf(s)}`);
      const working = chapter.stageViews.find((s) => s.status === "running");
      const summary =
        o.state === "failed"
          ? `${TEST_LABEL[o.stage ?? ""] ?? o.stage} failed`
          : lines.length
            ? lines.join(" · ")
            : working?.progress
              ? `Still working: ${working.progress}`
              : `${chapter.title}: ${chapter.state.replace("_", " ")}`;
      return {
        summary,
        ok: o.state !== "failed",
        output: {
          outcome: o.state,
          chapter: chapter.id,
          chapter_state: chapter.state,
          note: chapter.note,
          finished: finished.map((s) => ({ stage: s.id, result: summaryOf(s) })),
          stages: statusOf(run).chapters[run.currentChapter].stages,
        },
      };
    },
  }),

  tool({
    name: "read_report",
    description: "Read the full report of a finished stage (JSON, trimmed if very long): findings with severity and the source line each comes from. Read the reports of a chapter before you approve it.",
    schema: z.object({ stage: z.enum(["story_test", "intake", "story", "continuity", "breakdown", "locations", "schedule", "budget"]) }),
    async run({ stage }, env) {
      const run = await mustLoad(env);
      const s = run.stages.find((x) => x.id === stage);
      if (!s || s.status !== "done") return { summary: `${TEST_LABEL[stage]} has no report yet`, output: { error: `The ${stage} stage has not finished (status: ${s?.status ?? "missing"}).` } };
      const json = JSON.stringify(s.report);
      return {
        summary: `Read the ${TEST_LABEL[stage] ?? stage} report`,
        output: { stage, result: summaryOf(s), report: json.length > REPORT_CHARS ? `${json.slice(0, REPORT_CHARS)}… (trimmed, ${json.length} characters in all)` : s.report },
      };
    },
  }),

  tool({
    name: "read_document",
    description: `Read the story or the screenplay with line numbers (up to ${DOC_LINES} lines per call).`,
    schema: z.object({ which: z.enum(["story", "screenplay"]), from_line: z.number().int().min(1).optional(), to_line: z.number().int().min(1).optional() }),
    async run({ which, from_line, to_line }, env) {
      const run = await mustLoad(env);
      const text = which === "story" ? run.storyText : run.scriptText;
      if (!text) return { summary: `There is no ${which} yet`, output: { error: `This project has no ${which} yet.` } };
      const from = from_line ?? 1;
      const r = numbered(text, from, to_line ?? from + DOC_LINES - 1);
      return { summary: `Read the ${which}, lines ${r.from_line}–${r.to_line} of ${r.total_lines}`, output: r };
    },
  }),

  tool({
    name: "write_screenplay_from_story",
    description: "Chapter II only, when it is waiting for a screenplay and the project has a story: have the screenplay written from the approved story. Then call run_current_chapter.",
    schema: z.object({}),
    async run(_input, env) {
      await writeScriptFromStory(env.db, env.runId);
      return { summary: "Asked for the screenplay to be written from the story", output: { ok: true, next: "Call run_current_chapter to write and test it." } };
    },
  }),

  tool({
    name: "revise_story",
    description: `Replace the story text (chapter I must be open) and test it again. Use only to fix concrete problems the story report found, keep the author's voice, events and characters, and change as little as possible. At most ${MAX_STORY_REVISIONS} revisions per project; after that, ask the user.`,
    schema: z.object({ text: z.string().min(1).describe("The complete revised story."), reason: z.string().describe("Which findings this revision fixes.") }),
    async run({ text }, env) {
      const done = await env.db.select({ content: agentEvents.content, tool: agentEvents.tool }).from(agentEvents).where(eq(agentEvents.runId, env.runId)).orderBy(asc(agentEvents.id));
      const used = done.filter((e) => e.tool === "revise_story" && e.content.startsWith("Revised")).length;
      if (used >= MAX_STORY_REVISIONS) return { summary: "Revision limit reached", output: { error: `The story was already revised ${used} times. Ask the user instead.` } };
      await updateStory(env.db, env.runId, text);
      return { summary: `Revised the story (${text.split(/\s+/).filter(Boolean).length} words); testing it again`, output: { ok: true, next: "Call run_current_chapter to test the revised story." } };
    },
  }),

  tool({
    name: "retry_failed_stage",
    description: "Reset a failed stage so run_current_chapter tries it again. Retry once; if it fails again, ask the user.",
    schema: z.object({}),
    async run(_input, env) {
      await retryRun(env.db, env.runId);
      return { summary: "Reset the failed stage", output: { ok: true, next: "Call run_current_chapter." } };
    },
  }),

  tool({
    name: "approve_chapter",
    description: "Sign off the current chapter once all its stages are done (state 'ready'), which unlocks the next one. Approving 'budget' greenlights the production. Give the reason in one or two sentences, naming any high-severity notes left open.",
    schema: z.object({ chapter: z.enum(CHAPTER_IDS), note: z.string().describe("Why it is ready, and what is still open.") }),
    async run({ chapter }, env) {
      const i = chapterIndex(chapter);
      await approveChapter(env.db, env.runId, i);
      const next = CHAPTERS[i + 1];
      return { summary: next ? `Approved ${CHAPTERS[i].title}; ${next.title} is open` : "Approved The Budget: the production is greenlit", output: { ok: true, next_chapter: next?.id ?? null } };
    },
  }),

  tool({
    name: "reopen_chapter",
    description: "Reopen an approved chapter to change it. Every later chapter is reset and must run again. Use when a later finding traces back to an earlier chapter.",
    schema: z.object({ chapter: z.enum(CHAPTER_IDS), reason: z.string() }),
    async run({ chapter }, env) {
      const i = chapterIndex(chapter);
      await reopenChapter(env.db, env.runId, i);
      return { summary: `Reopened ${CHAPTERS[i].title}`, output: { ok: true } };
    },
  }),

  tool({
    name: "ask_user",
    description: "Stop and ask the user a question, when you need a decision only they can make (for example, a stage keeps failing, or a fix would change their story beyond a small revision). Your turn ends until they answer.",
    schema: z.object({ question: z.string() }),
    async run({ question }) {
      return { summary: question, output: { ok: true, note: "Waiting for the user." }, control: "wait" };
    },
  }),

  tool({
    name: "finish",
    description: "End the job, with a short summary for the user: what was made, what was approved, and the notes still open. Call it when the production is greenlit.",
    schema: z.object({ summary: z.string() }),
    async run({ summary }) {
      return { summary, output: { ok: true }, control: "finish" };
    },
  }),
];

export function toolSpecs(): ToolSpec[] {
  return TOOLS.map((t) => {
    const schema = z.toJSONSchema(t.schema) as Record<string, unknown>;
    delete schema.$schema;
    return { name: t.name, description: t.description, parameters: schema };
  });
}

/** Run one tool call. Never throws: bad input and failures come back as `{ error }` and are logged. */
export async function runTool(name: string, input: Record<string, unknown>, env: ToolEnv): Promise<ToolOutcome> {
  const t = TOOLS.find((x) => x.name === name);
  if (!t) return { ok: false, summary: `Unknown tool ${name}`, output: { error: `There is no tool named "${name}". Tools: ${TOOLS.map((x) => x.name).join(", ")}.` } };
  const parsed = t.schema.safeParse(input);
  if (!parsed.success) return { ok: false, summary: `Invalid input for ${name}`, output: { error: `Invalid input: ${z.prettifyError(parsed.error)}` } };
  try {
    const r = await t.run(parsed.data, env);
    return { ...r, ok: r.ok ?? true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await new Ledger(env.db).issue(`agent:${name}`, "warning", `run ${env.runId}`, message);
    return { ok: false, summary: message, output: { error: message } };
  }
}
