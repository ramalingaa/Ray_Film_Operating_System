/**
 * The agent's transcript shaped for the workspace timeline: each tool call is
 * paired with its result (or shown as running), and status rows become notes.
 */
import { asc, desc, eq } from "drizzle-orm";
import { parseData, type AssistantData, type ToolData, type UserData } from "../agent/transcript";
import type { Db } from "../db/client";
import { agentEvents, runs, type AgentStatus } from "../db/schema";

export type TimelineItem =
  | { type: "user"; id: number; text: string; files: { name: string; words: number }[]; at: string }
  | { type: "agent"; id: number; text: string; model?: string; at: string }
  | { type: "tool"; id: number; tool: string; input: Record<string, unknown>; state: "running" | "ok" | "error"; summary: string; output?: unknown; at: string }
  | { type: "error"; id: number; text: string; at: string }
  | { type: "note"; id: number; text: string; at: string };

export async function loadTimeline(db: Db, runId: number): Promise<TimelineItem[]> {
  const rows = await db.select().from(agentEvents).where(eq(agentEvents.runId, runId)).orderBy(asc(agentEvents.id));
  const items: TimelineItem[] = [];
  const byCall = new Map<string, Extract<TimelineItem, { type: "tool" }>>();
  for (const r of rows) {
    if (r.kind === "user") {
      const files = (parseData<UserData>(r).attachments ?? []).map((f) => ({ name: f.name, words: f.words }));
      items.push({ type: "user", id: r.id, text: r.content, files, at: r.createdAt });
    }
    else if (r.kind === "error") items.push({ type: "error", id: r.id, text: r.content, at: r.createdAt });
    else if (r.kind === "status") items.push({ type: "note", id: r.id, text: r.content, at: r.createdAt });
    else if (r.kind === "assistant") {
      const d = parseData<AssistantData>(r);
      if (r.content.trim()) items.push({ type: "agent", id: r.id, text: r.content.trim(), model: d.model, at: r.createdAt });
      for (const c of d.toolCalls ?? []) {
        const item = { type: "tool" as const, id: r.id, tool: c.name, input: c.input, state: "running" as const, summary: "", at: r.createdAt };
        byCall.set(c.id, item);
        items.push(item);
      }
    } else if (r.kind === "tool" && r.callId) {
      const item = byCall.get(r.callId);
      if (!item) continue;
      const d = parseData<ToolData>(r);
      Object.assign(item, { state: d.ok === false ? "error" : "ok", summary: r.content, output: d.output, at: r.createdAt });
    }
  }
  return items;
}

/** Calls that never got a result while the agent is not running were cut off, not still running. */
export function settle(items: TimelineItem[], status: AgentStatus): TimelineItem[] {
  if (status === "running") return items;
  return items.map((i) => (i.type === "tool" && i.state === "running" ? { ...i, state: "error", summary: "Interrupted" } : i));
}

export async function agentStatusOf(db: Db, runId: number): Promise<AgentStatus | undefined> {
  const [r] = await db.select({ s: runs.agentStatus }).from(runs).where(eq(runs.id, runId));
  return r?.s;
}

/** Projects for the sidebar, newest first, with the agent's status. */
export async function listProjects(db: Db, limit = 50) {
  return db
    .select({ id: runs.id, title: runs.title, inputKind: runs.inputKind, approvedThrough: runs.approvedThrough, agentStatus: runs.agentStatus, updatedAt: runs.updatedAt, createdAt: runs.createdAt })
    .from(runs)
    .orderBy(desc(runs.id))
    .limit(limit);
}

export const AGENT_STATUS_TEXT: Record<AgentStatus, string> = {
  idle: "Not started",
  running: "Working",
  waiting: "Waiting for you",
  done: "Done",
  stopped: "Stopped",
  failed: "Needs attention",
};

/** Plain-language label for a tool call in the timeline. */
export const TOOL_LABEL: Record<string, string> = {
  get_status: "Checked the project",
  adopt_material: "Took in your material",
  write_story: "Saved the story",
  run_current_chapter: "Ran the chapter's tests",
  read_report: "Read a report",
  read_document: "Read the text",
  write_screenplay_from_story: "Wrote the screenplay from the story",
  revise_story: "Revised the story",
  retry_failed_stage: "Retried a failed stage",
  approve_chapter: "Approved a chapter",
  reopen_chapter: "Reopened a chapter",
  ask_user: "Asked you",
  finish: "Finished",
};
