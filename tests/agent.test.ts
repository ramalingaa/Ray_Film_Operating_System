import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { asc, eq } from "drizzle-orm";
import { agentToEnd, agentTurn, scriptedDecision, sendToAgent, startAgent, stopAgent } from "@/lib/agent/loop";
import { runTool, toolSpecs } from "@/lib/agent/tools";
import { toChatMessages, type AgentEventRow } from "@/lib/agent/transcript";
import { openDb } from "@/lib/db/client";
import { agentEvents, runs } from "@/lib/db/schema";
import { toAnthropicMessages } from "@/lib/llm/anthropic";
import { ModelGateway } from "@/lib/llm/gateway";
import { parseArguments, toOpenAIMessages } from "@/lib/llm/openai-compatible";
import type { ChatRequest, ChatResult, ModelAdapter, StructuredRequest } from "@/lib/llm/types";
import { createRun } from "@/lib/pipeline/runs";
import { loadRun } from "@/lib/ui/runs";
import { CLEAN_PLAN, planExtractor } from "./helpers/placeholder-plan";
import { routerModel } from "./helpers/router-model";
import { fullStructureRead } from "./helpers/story-fakes";

const script = fs.readFileSync("data/script.fountain", "utf8");
const judgeSettings = { policy: "primary" as const, threshold: 0.7 };
type Db = Awaited<ReturnType<typeof openDb>>;

const extraction = (() => {
  const plan = planExtractor(CLEAN_PLAN, script);
  return async (req: Parameters<typeof plan.generate>[0]) => (await plan.generate(req)).data;
})();

function stageGateway() {
  const model = routerModel({ story_analysis: fullStructureRead, verdict: () => ({ conflict: false, confidence: 0.9, reason: "-" }), scene_extraction: extraction });
  return new ModelGateway({ extract: ["fake:router"], judge: ["fake:router"] }, () => model);
}

/** A tool-calling model stand-in that answers from a script of turns, recording what it was sent. */
function chatModel(turns: ((req: ChatRequest) => Partial<ChatResult>)[]) {
  const seen: ChatRequest[] = [];
  const model: ModelAdapter & { chat(req: ChatRequest): Promise<ChatResult>; seen: ChatRequest[] } = {
    spec: "fake:agent",
    seen,
    async generate<T>(req: StructuredRequest<T>): Promise<never> {
      throw new Error(`not used: ${req.schemaName}`);
    },
    async chat(req) {
      seen.push(req);
      const t = turns[seen.length - 1];
      if (!t) throw new Error("the fake agent ran out of turns");
      const r = t(req);
      return { text: r.text ?? "", toolCalls: r.toolCalls ?? [], stop: r.toolCalls?.length ? "tool_use" : "end", model: "fake:agent", usage: {} };
    },
  };
  return model;
}

const events = async (db: Db, id: number) => db.select().from(agentEvents).where(eq(agentEvents.runId, id)).orderBy(asc(agentEvents.id));
const agentStatus = async (db: Db, id: number) => (await db.select({ s: runs.agentStatus }).from(runs).where(eq(runs.id, id)))[0].s;

const row = (id: number, kind: AgentEventRow["kind"], content: string, extra: Partial<AgentEventRow> = {}): AgentEventRow => ({ id, kind, content, tool: null, callId: null, dataJson: null, ...extra });

describe("rebuilding the conversation from events", () => {
  it("pairs every call with one result, defers a user message sent mid-call, and stands in for lost results", () => {
    const msgs = toChatMessages([
      row(1, "user", "Go"),
      row(2, "assistant", "Checking.", { dataJson: JSON.stringify({ toolCalls: [{ id: "a", name: "get_status", input: {} }, { id: "b", name: "read_report", input: { stage: "intake" } }] }) }),
      row(3, "user", "Also check the budget"),
      row(4, "tool", "ok", { callId: "a", tool: "get_status", dataJson: JSON.stringify({ output: { title: "X" } }) }),
      row(5, "status", "Stopped by you."),
      row(6, "assistant", "", { dataJson: JSON.stringify({ toolCalls: [{ id: "c", name: "get_status", input: {} }] }) }),
    ]);
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant", "tool", "tool", "user", "assistant", "tool"]);
    expect(msgs[3]).toMatchObject({ role: "tool", toolCallId: "b", content: expect.stringContaining("interrupted") });
    expect(msgs[4]).toEqual({ role: "user", content: "Also check the budget" });
    expect(msgs[6]).toMatchObject({ toolCallId: "c", content: expect.stringContaining("interrupted") });
  });

  it("trims older tool results but keeps recent ones whole", () => {
    const big = "x".repeat(2000);
    const rows: AgentEventRow[] = [row(1, "user", "Go")];
    for (let i = 0; i < 10; i++) {
      rows.push(row(rows.length + 1, "assistant", "", { dataJson: JSON.stringify({ toolCalls: [{ id: `c${i}`, name: "get_status", input: {} }] }) }));
      rows.push(row(rows.length + 1, "tool", "", { callId: `c${i}`, dataJson: JSON.stringify({ output: big }) }));
    }
    const tools = toChatMessages(rows, { keepFull: 4 }).filter((m) => m.role === "tool");
    expect(tools[0].content.length).toBeLessThan(700);
    expect(tools.at(-1)!.content.length).toBeGreaterThan(2000);
  });
});

describe("provider message formats", () => {
  it("Anthropic: tool results go in a user turn, same-role turns merge, and the first turn is the user's", () => {
    const m = toAnthropicMessages([
      { role: "assistant", content: "Hi", toolCalls: [{ id: "t1", name: "get_status", input: {} }] },
      { role: "tool", toolCallId: "t1", name: "get_status", content: "{}" },
      { role: "user", content: "Thanks" },
    ]);
    expect(m.map((x) => x.role)).toEqual(["user", "assistant", "user"]);
    expect(m[2].content).toEqual([
      { type: "tool_result", tool_use_id: "t1", content: "{}" },
      { type: "text", text: "Thanks" },
    ]);
  });

  it("OpenAI-compatible: assistant tool_calls carry JSON arguments, and bad arguments are kept for the tool to report", () => {
    const m = toOpenAIMessages("sys", [{ role: "assistant", content: "", toolCalls: [{ id: "t1", name: "read_report", input: { stage: "budget" } }] }]);
    expect(m[1]).toMatchObject({ role: "assistant", content: null, tool_calls: [{ id: "t1", function: { name: "read_report", arguments: '{"stage":"budget"}' } }] });
    expect(parseArguments('{"a":1}')).toEqual({ a: 1 });
    expect(parseArguments("{oops")).toEqual({ _invalid: "{oops" });
    expect(parseArguments(undefined)).toEqual({});
  });

  it("the gateway skips models that cannot call tools and falls back on errors", async () => {
    const plain: ModelAdapter = { spec: "x:plain", generate: async () => ({ data: null as never, model: "x:plain", usage: {} }) };
    const broken = chatModel([() => { throw new Error("boom"); }]);
    const good = chatModel([() => ({ text: "hello" })]);
    const g = new ModelGateway({ agent: ["x:plain", "x:broken", "x:good"] }, (s) => (s === "x:plain" ? plain : s === "x:broken" ? broken : good), []);
    const r = await g.chat("agent", { system: "s", messages: [{ role: "user", content: "hi" }], tools: toolSpecs() });
    expect(r.text).toBe("hello");
    expect(r.attempts.map((a) => a.outcome)).toEqual(["error", "error", "ok"]);
  });

  it("every tool has an object JSON schema", () => {
    for (const t of toolSpecs()) expect(t.parameters).toMatchObject({ type: "object" });
  });
});

describe("tools", () => {
  it("report bad input and failed actions as errors instead of throwing", async () => {
    const db = await openDb(":memory:");
    const id = await createRun(db, { sourceName: "script.fountain", text: script });
    const env = { db, runId: id, judgeSettings, deadline: Date.now() + 60_000 };
    expect(await runTool("nope", {}, env)).toMatchObject({ ok: false, output: { error: expect.stringContaining("no tool") } });
    expect(await runTool("read_report", { stage: "nonsense" }, env)).toMatchObject({ ok: false, output: { error: expect.stringContaining("Invalid input") } });
    expect(await runTool("approve_chapter", { chapter: "budget", note: "-" }, env)).toMatchObject({ ok: false, output: { error: "Chapters are approved in order." } });
    expect(await runTool("get_status", {}, env)).toMatchObject({ ok: true, output: { title: "The Keeper's Ledger", current_chapter: "script" } });
  });
});

describe("the scripted agent (no tool-calling model)", () => {
  it("takes a screenplay all the way to a greenlight and finishes", async () => {
    const db = await openDb(":memory:");
    const id = await createRun(db, { sourceName: "script.fountain", text: script });
    await startAgent(db, id);
    expect(await agentToEnd(db, id, { stageGateway: stageGateway(), judgeSettings })).toEqual({ state: "done" });
    const run = await loadRun(db, id);
    expect(run!.greenlit).toBe(true);
    const tools = (await events(db, id)).filter((e) => e.kind === "tool").map((e) => e.tool);
    expect(tools).toContain("run_current_chapter");
    expect(tools.filter((t) => t === "approve_chapter")).toHaveLength(5);
    expect(tools.at(-1)).toBe("finish");
    expect((await db.select().from(runs).where(eq(runs.id, id)))[0].agentLockedUntil).toBeNull();
  });

  it("retries a failed stage once, then asks the user", async () => {
    const db = await openDb(":memory:");
    // A story with no model configured: writing its screenplay needs a model, so chapter II fails.
    const id = await createRun(db, { sourceName: "pasted", title: "Rain", text: "Maya waits on the pier. Daniel brings the key. Voss lies." });
    await startAgent(db, id);
    expect(await agentToEnd(db, id, { judgeSettings })).toEqual({ state: "waiting" });
    const tools = (await events(db, id)).filter((e) => e.kind === "tool").map((e) => e.tool);
    expect(tools).toContain("write_screenplay_from_story");
    expect(tools.filter((t) => t === "retry_failed_stage")).toHaveLength(1);
    expect(tools.at(-1)).toBe("ask_user");
  });

  it("decides from state alone", async () => {
    const db = await openDb(":memory:");
    const id = await createRun(db, { sourceName: "script.fountain", text: script });
    const run = (await loadRun(db, id))!;
    expect(scriptedDecision(run).call.name).toBe("run_current_chapter");
  });
});

describe("the model-driven agent", () => {
  it("calls tools, hands the turn to the user when it asks, and picks up the reply", async () => {
    const db = await openDb(":memory:");
    const id = await createRun(db, { sourceName: "script.fountain", text: script });
    const model = chatModel([
      () => ({ text: "Let me look.", toolCalls: [{ id: "1", name: "get_status", input: {} }] }),
      () => ({ toolCalls: [{ id: "2", name: "ask_user", input: { question: "Shoot in Lisbon or Porto?" } }] }),
      () => ({ text: "Porto it is. Starting the screenplay checks." }),
    ]);
    const agentGateway = new ModelGateway({ agent: ["fake:agent"] }, () => model);
    await startAgent(db, id, "Plan this film.");

    expect(await agentTurn(db, id, { agentGateway, judgeSettings })).toEqual({ state: "waiting" });
    expect(model.seen[1].messages.at(-1)).toMatchObject({ role: "tool", toolCallId: "1", content: expect.stringContaining("The Keeper's Ledger") });
    expect(model.seen[0].system).toContain("producer agent");

    await sendToAgent(db, id, "Porto");
    expect(await agentStatus(db, id)).toBe("running");
    expect(await agentTurn(db, id, { agentGateway, judgeSettings })).toEqual({ state: "waiting" });
    expect(model.seen[2].messages.slice(-2)).toEqual([
      { role: "tool", toolCallId: "2", name: "ask_user", content: expect.any(String) },
      { role: "user", content: "Porto" },
    ]);
    const kinds = (await events(db, id)).map((e) => e.kind);
    expect(kinds).toEqual(["user", "assistant", "tool", "assistant", "tool", "user", "assistant"]);
  });

  it("stops when the user stops it, and records a model failure instead of swallowing it", async () => {
    const db = await openDb(":memory:");
    const id = await createRun(db, { sourceName: "script.fountain", text: script });
    await startAgent(db, id);
    await stopAgent(db, id);
    const never = chatModel([]);
    expect(await agentTurn(db, id, { agentGateway: new ModelGateway({ agent: ["fake:agent"] }, () => never), judgeSettings })).toEqual({ state: "stopped" });
    expect(never.seen).toHaveLength(0);

    await sendToAgent(db, id, "go on");
    const failing = chatModel([() => { throw new Error("provider down"); }]);
    expect(await agentTurn(db, id, { agentGateway: new ModelGateway({ agent: ["fake:agent"] }, () => failing, []), judgeSettings })).toEqual({ state: "failed" });
    const last = (await events(db, id)).at(-1)!;
    expect(last).toMatchObject({ kind: "error", content: expect.stringContaining("provider down") });
  });
});

describe("the background queue", () => {
  it("runs a turn on every queued project, skips ones that are leased or not running, and finishes jobs over ticks", async () => {
    const { queuedProjects, runQueue } = await import("@/lib/agent/queue");
    const db = await openDb(":memory:");
    const a = await createRun(db, { sourceName: "script.fountain", text: script });
    const b = await createRun(db, { sourceName: "script.fountain", text: script });
    const idle = await createRun(db, { sourceName: "script.fountain", text: script });
    await startAgent(db, a);
    await startAgent(db, b);
    await db.update(runs).set({ agentLockedUntil: Date.now() + 60_000 }).where(eq(runs.id, b));
    expect(await queuedProjects(db, 10)).toEqual([a]);

    await db.update(runs).set({ agentLockedUntil: null }).where(eq(runs.id, b));
    expect((await queuedProjects(db, 10)).sort()).toEqual([a, b].sort());
    let tick;
    for (let i = 0; i < 40; i++) {
      tick = await runQueue(db, { stageGateway: stageGateway(), judgeSettings, concurrency: 2 });
      if (tick.waiting === 0) break;
    }
    expect(tick!.waiting).toBe(0);
    expect(await agentStatus(db, a)).toBe("done");
    expect(await agentStatus(db, b)).toBe("done");
    expect(await agentStatus(db, idle)).toBe("idle");
  });

  it("only runs for a cron call that carries the secret, and refuses in production without one", async () => {
    const { cronAuthorized } = await import("@/lib/agent/queue");
    expect(cronAuthorized("Bearer s3", { CRON_SECRET: "s3" })).toEqual({ ok: true });
    expect(cronAuthorized("Bearer nope", { CRON_SECRET: "s3" })).toMatchObject({ ok: false, status: 401 });
    expect(cronAuthorized(null, { NODE_ENV: "production" })).toMatchObject({ ok: false, status: 500 });
    expect(cronAuthorized(null, { NODE_ENV: "development" })).toEqual({ ok: true });
  });
});
