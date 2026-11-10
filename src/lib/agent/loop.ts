/**
 * The project agent. Each project has one agent that takes it from the first
 * chapter to the greenlight on its own: it plans, calls tools (the pipeline's
 * stages and gates), reads what they found, fixes what it can, and signs
 * chapters off. The user can message it, stop it, or resume it at any time.
 *
 * A turn is time-boxed like a pipeline step (serverless requests are short):
 * it leases the project, rebuilds the conversation from `agent_events`, and
 * alternates model calls and tool calls until the job is done, the agent asks
 * the user something, the user stops it, or the time budget is spent. The
 * page calls the next turn.
 *
 * Without a tool-calling model (no MODEL_AGENT key), a scripted policy makes
 * the same tool calls in the standard order, so the app still works offline.
 */
import { and, asc, desc, eq, isNull, lt, or } from "drizzle-orm";
import { Ledger } from "../agents/runtime";
import type { JudgeSettings } from "../checks/judge";
import type { Db } from "../db/client";
import { agentEvents, runs, type AgentStatus } from "../db/schema";
import type { ModelGateway } from "../llm/gateway";
import type { ToolCall } from "../llm/types";
import { loadRun, type RunView } from "../ui/runs";
import { agentSystemPrompt } from "./prompt";
import { runTool, toolSpecs, type ToolEnv } from "./tools";
import { toChatMessages } from "./transcript";

const now = () => new Date().toISOString();

export const DEFAULT_GOAL =
  "Take this production from where it is now to a greenlight. Work through every chapter in order, test it, fix what you can, and approve it when it is ready. Tell me briefly what you find as you go.";

export const NO_MODEL_NOTE =
  "I am running without a language model (set MODEL_AGENT, or a model key, to give me one), so I cannot read messages yet. I will keep following the standard steps; use the chapter-by-chapter view to make changes yourself.";

export interface AgentTurnOptions {
  /** Tool-calling model(s) for the agent itself. Absent: the scripted policy decides. */
  agentGateway?: ModelGateway;
  /** Models the stages use (extraction, judging, adaptation). */
  stageGateway?: ModelGateway;
  judgeSettings: JudgeSettings;
  budgetMs?: number;
  /** Safety cap on decisions per turn. */
  maxDecisions?: number;
}

export type AgentTurnOutcome = { state: "busy" } | { state: "progress" | AgentStatus };

// ---- events ----------------------------------------------------------------------

export async function addEvent(db: Db, runId: number, e: { kind: (typeof agentEvents.$inferInsert)["kind"]; content?: string; tool?: string; callId?: string; data?: unknown }) {
  await db.insert(agentEvents).values({
    runId,
    kind: e.kind,
    content: e.content ?? "",
    tool: e.tool,
    callId: e.callId,
    dataJson: e.data === undefined ? null : JSON.stringify(e.data),
  });
}

async function setStatus(db: Db, runId: number, status: AgentStatus) {
  await db.update(runs).set({ agentStatus: status, updatedAt: now() }).where(eq(runs.id, runId));
}

/** Start (or restart) the agent with a goal. */
export async function startAgent(db: Db, runId: number, goal = DEFAULT_GOAL): Promise<void> {
  await addEvent(db, runId, { kind: "user", content: goal });
  await setStatus(db, runId, "running");
}

/** A message from the user. It always wakes the agent, which reads it on its next decision. */
export async function sendToAgent(db: Db, runId: number, text: string): Promise<void> {
  if (!text.trim()) throw new Error("The message is empty.");
  await addEvent(db, runId, { kind: "user", content: text.trim() });
  await setStatus(db, runId, "running");
}

/** Stop after the current tool call. */
export async function stopAgent(db: Db, runId: number): Promise<void> {
  await setStatus(db, runId, "stopped");
  await addEvent(db, runId, { kind: "status", content: "Stopped by you." });
}

export async function resumeAgent(db: Db, runId: number): Promise<void> {
  await addEvent(db, runId, { kind: "status", content: "Resumed." });
  await addEvent(db, runId, { kind: "user", content: "Continue from where you stopped." });
  await setStatus(db, runId, "running");
}

// ---- the scripted policy ---------------------------------------------------------------

/**
 * What a careful producer would do next, decided in code from the project's
 * state. Used when no tool-calling model is configured, and as the reference
 * the model-driven agent is tested against.
 */
export function scriptedDecision(run: RunView, recentTools: string[] = []): { text: string; call: Omit<ToolCall, "id"> } {
  const lastTool = recentTools.at(-1);
  if (run.greenlit) {
    return { text: "", call: { name: "finish", input: { summary: `${run.title} is greenlit: all ${run.chapters.length} chapters are approved.` } } };
  }
  const c = run.chapters[run.currentChapter];
  switch (c.state) {
    case "failed":
      if (!recentTools.slice(-4).includes("retry_failed_stage")) return { text: "", call: { name: "retry_failed_stage", input: {} } };
      return { text: "", call: { name: "ask_user", input: { question: `${c.title} failed: ${(c.note ?? "unknown error").replace(/[.\s]+$/, "")}. How would you like to proceed?` } } };
    case "awaiting_input":
      if (run.storyText) return { text: `${c.title} needs a screenplay. I will write it from the story.`, call: { name: "write_screenplay_from_story", input: {} } };
      return { text: "", call: { name: "ask_user", input: { question: "Chapter II needs a screenplay. Paste one, or give me a story to write it from." } } };
    case "ready":
      if (lastTool === "run_current_chapter" || lastTool === "get_status") {
        const stage = c.stageViews.at(-1);
        if (stage) return { text: "", call: { name: "read_report", input: { stage: stage.id } } };
      }
      return { text: "", call: { name: "approve_chapter", input: { chapter: c.id, note: "All of this chapter's tests have run." } } };
    default:
      return { text: "", call: { name: "run_current_chapter", input: {} } };
  }
}

// ---- one turn ------------------------------------------------------------------------

async function lease(db: Db, runId: number, ms: number) {
  const t = Date.now();
  const [row] = await db
    .update(runs)
    .set({ agentLockedUntil: t + ms })
    .where(and(eq(runs.id, runId), eq(runs.agentStatus, "running"), or(isNull(runs.agentLockedUntil), lt(runs.agentLockedUntil, t))))
    .returning({ id: runs.id });
  return row;
}

async function currentStatus(db: Db, runId: number): Promise<AgentStatus> {
  const [r] = await db.select({ s: runs.agentStatus }).from(runs).where(eq(runs.id, runId));
  if (!r) throw new Error(`project ${runId} not found`);
  return r.s;
}

let callSeq = 0;
const scriptedId = () => `scripted_${Date.now().toString(36)}_${(callSeq++).toString(36)}`;

export async function agentTurn(db: Db, runId: number, opts: AgentTurnOptions): Promise<AgentTurnOutcome> {
  const budget = opts.budgetMs ?? 200_000;
  if (!(await lease(db, runId, budget + 90_000))) {
    const s = await currentStatus(db, runId);
    return s === "running" ? { state: "busy" } : { state: s };
  }
  const deadline = Date.now() + budget;
  const env: ToolEnv = { db, runId, gateway: opts.stageGateway, judgeSettings: opts.judgeSettings, deadline };
  const ledger = new Ledger(db);
  const maxDecisions = opts.maxDecisions ?? 24;
  let outcome: AgentTurnOutcome = { state: "progress" };
  const recentTools: string[] = [];

  try {
    for (let n = 0; n < maxDecisions; n++) {
      const status = await currentStatus(db, runId);
      if (status !== "running") {
        outcome = { state: status };
        break;
      }
      // Leave room for one more tool call; the page starts the next turn.
      if (n > 0 && Date.now() > deadline - 20_000) break;

      // Decide: the model, or the scripted policy.
      let text: string;
      let calls: ToolCall[];
      let model: string;
      if (opts.agentGateway) {
        const events = await db.select().from(agentEvents).where(eq(agentEvents.runId, runId)).orderBy(asc(agentEvents.id));
        const run = await loadRun(db, runId);
        const ledgerId = await ledger.start("project-agent@1", `run ${runId}`);
        try {
          const r = await opts.agentGateway.chat("agent", { system: agentSystemPrompt(run), messages: toChatMessages(events), tools: toolSpecs() });
          await ledger.finish(ledgerId, "ok", { model: r.model, usage: r.usage });
          text = r.text;
          calls = r.toolCalls;
          model = r.model;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await ledger.finish(ledgerId, "failed", {}, message);
          await ledger.issue("agent", "error", `run ${runId}`, message);
          await addEvent(db, runId, { kind: "error", content: `The agent model failed: ${message}` });
          await setStatus(db, runId, "failed");
          outcome = { state: "failed" };
          break;
        }
      } else {
        const run = await loadRun(db, runId);
        if (!run) throw new Error(`project ${runId} not found`);
        if (!recentTools.length) {
          const prior = await db.select({ tool: agentEvents.tool }).from(agentEvents).where(and(eq(agentEvents.runId, runId), eq(agentEvents.kind, "tool"))).orderBy(asc(agentEvents.id));
          recentTools.push(...prior.slice(-6).map((p) => p.tool ?? ""));
        }
        const d = scriptedDecision(run, recentTools);
        text = d.text;
        // The scripted policy cannot read messages; say so instead of silently ignoring one.
        const [last] = await db.select({ kind: agentEvents.kind, id: agentEvents.id }).from(agentEvents).where(eq(agentEvents.runId, runId)).orderBy(desc(agentEvents.id)).limit(1);
        const [firstEvent] = await db.select({ id: agentEvents.id }).from(agentEvents).where(eq(agentEvents.runId, runId)).orderBy(asc(agentEvents.id)).limit(1);
        if (n === 0 && last?.kind === "user" && last.id !== firstEvent?.id) {
          text = `${NO_MODEL_NOTE}${text ? `\n\n${text}` : ""}`;
        }
        calls = [{ id: scriptedId(), ...d.call }];
        model = "scripted";
      }

      await addEvent(db, runId, { kind: "assistant", content: text, data: { toolCalls: calls, model } });
      if (!calls.length) {
        // The agent spoke without acting: it is handing the turn to the user.
        await setStatus(db, runId, "waiting");
        outcome = { state: "waiting" };
        break;
      }

      let control: "wait" | "finish" | undefined;
      for (const call of calls) {
        if (control) {
          await addEvent(db, runId, { kind: "tool", tool: call.name, callId: call.id, content: "Skipped", data: { input: call.input, output: { error: "Skipped: the turn ended first." }, ok: false } });
          continue;
        }
        const r = await runTool(call.name, call.input, env);
        recentTools.push(call.name);
        await addEvent(db, runId, { kind: "tool", tool: call.name, callId: call.id, content: r.summary, data: { input: call.input, output: r.output, ok: r.ok } });
        control = r.control;
      }
      if (control === "wait" || control === "finish") {
        const s: AgentStatus = control === "wait" ? "waiting" : "done";
        // Only if the user did not stop it or write in the meantime.
        if ((await currentStatus(db, runId)) === "running") await setStatus(db, runId, s);
        outcome = { state: s };
        break;
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await ledger.issue("agent", "error", `run ${runId}`, message);
    await addEvent(db, runId, { kind: "error", content: message });
    await setStatus(db, runId, "failed");
    outcome = { state: "failed" };
  } finally {
    await db.update(runs).set({ agentLockedUntil: null }).where(eq(runs.id, runId));
  }
  return outcome;
}

/** Run turns until the agent stops needing the server (tests and the CLI). */
export async function agentToEnd(db: Db, runId: number, opts: AgentTurnOptions, maxTurns = 50): Promise<AgentTurnOutcome> {
  let o: AgentTurnOutcome = { state: "progress" };
  for (let i = 0; i < maxTurns; i++) {
    o = await agentTurn(db, runId, opts);
    if (o.state !== "progress" && o.state !== "busy") return o;
  }
  return o;
}
