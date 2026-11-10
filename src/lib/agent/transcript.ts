/**
 * Rebuild the model conversation from stored agent events. Pure, so it can be
 * tested without a database or a model.
 *
 * - Every tool call gets exactly one result. A call whose result was never
 *   stored (the turn was cut off) gets a stand-in result.
 * - A user message that arrived while tool calls were outstanding is moved
 *   after their results, so providers see a valid call → result order.
 * - Older tool results are shortened to keep the context small; the most
 *   recent ones stay whole.
 */
import type { agentEvents } from "../db/schema";
import type { ChatMessage, ToolCall } from "../llm/types";

export type AgentEventRow = Pick<typeof agentEvents.$inferSelect, "id" | "kind" | "tool" | "callId" | "content" | "dataJson">;

export interface AssistantData {
  toolCalls?: ToolCall[];
  model?: string;
}

export interface ToolData {
  input?: Record<string, unknown>;
  output?: unknown;
  ok?: boolean;
}

const INTERRUPTED = JSON.stringify({ error: "No result: the turn was interrupted before this tool finished. Check get_status." });

export function parseData<T>(row: Pick<AgentEventRow, "dataJson">): T {
  if (!row.dataJson) return {} as T;
  try {
    return JSON.parse(row.dataJson) as T;
  } catch {
    return {} as T;
  }
}

export function toChatMessages(events: AgentEventRow[], opts: { keepFull?: number; shortChars?: number } = {}): ChatMessage[] {
  const keepFull = opts.keepFull ?? 14;
  const shortChars = opts.shortChars ?? 600;
  const out: ChatMessage[] = [];
  let pending: ToolCall[] = [];
  let deferred: string[] = [];

  const closePending = () => {
    for (const c of pending) out.push({ role: "tool", toolCallId: c.id, name: c.name, content: INTERRUPTED });
    pending = [];
  };
  const flushDeferred = () => {
    for (const d of deferred) out.push({ role: "user", content: d });
    deferred = [];
  };

  events.forEach((e, i) => {
    const recent = i >= events.length - keepFull;
    if (e.kind === "user") {
      if (pending.length) deferred.push(e.content);
      else out.push({ role: "user", content: e.content });
    } else if (e.kind === "assistant") {
      closePending();
      flushDeferred();
      const calls = parseData<AssistantData>(e).toolCalls ?? [];
      out.push({ role: "assistant", content: e.content, ...(calls.length ? { toolCalls: calls } : {}) });
      pending = [...calls];
    } else if (e.kind === "tool") {
      const idx = pending.findIndex((c) => c.id === e.callId);
      if (idx < 0) return; // orphan result: its call is not in the conversation
      const [call] = pending.splice(idx, 1);
      const text = JSON.stringify(parseData<ToolData>(e).output ?? null);
      out.push({ role: "tool", toolCallId: call.id, name: call.name, content: recent || text.length <= shortChars ? text : `${text.slice(0, shortChars)}… (older result, trimmed)` });
      if (!pending.length) flushDeferred();
    }
    // "error" and "status" rows are for people; the model sees the state through its tools.
  });
  closePending();
  flushDeferred();
  return out;
}
