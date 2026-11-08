import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { eq } from "drizzle-orm";
import { openDb } from "@/lib/db/client";
import { runs, runStages } from "@/lib/db/schema";
import { ModelGateway } from "@/lib/llm/gateway";
import {
  approveChapter,
  autopilot,
  createRun,
  reopenChapter,
  retryRun,
  runToEnd,
  setScript,
  stepRun,
  updateStory,
  writeScriptFromStory,
} from "@/lib/pipeline/runs";
import type { ContinuityReport } from "@/lib/stages/continuity";
import type { IntakeReport } from "@/lib/stages/intake";
import { emptyExtraction } from "./helpers/fake-model";
import { CLEAN_PLAN, planExtractor } from "./helpers/placeholder-plan";
import { routerModel } from "./helpers/router-model";

const script = fs.readFileSync("data/script.fountain", "utf8");
const judgeSettings = { policy: "primary" as const, threshold: 0.7 };
type Db = Awaited<ReturnType<typeof openDb>>;

async function stages(db: Db, runId: number) {
  const rows = await db.select().from(runStages).where(eq(runStages.runId, runId));
  return Object.fromEntries(rows.map((r) => [r.stage, r]));
}
const getRun = async (db: Db, id: number) => (await db.select().from(runs).where(eq(runs.id, id)))[0];

/** A minimal screenplay read: no beats or cards, citing the first scene heading. */
const minimalStory = (req: { user: string }) => {
  const m = /^\s*(\d+)\| ((?:INT|EXT).*)$/m.exec(req.user)!;
  return {
    logline: { protagonist: null, goal: null, stakes: null, obstacle: null, one_sentence: "-", missing: [], source_line: Number(m[1]), source_snippet: m[2] },
    beats: [],
    scenes: [],
    setups: [],
  };
};

/** A minimal development read of a prose story, citing its first line. */
const minimalDraft = (req: { user: string }) => {
  const m = /^\s*1\| (.+)$/m.exec(req.user)!;
  const first = m[1].split(/\s+/).slice(0, 5).join(" ");
  return {
    logline: { protagonist: "Maya", goal: null, stakes: null, obstacle: null, one_sentence: "-", missing: ["goal"], source_line: 1, source_snippet: first },
    beats: [],
    setups: [],
    strengths: [],
    questions: [{ question: "What does Maya want?", why: "Without a goal there is no story." }],
  };
};

const STORY = "Maya waits on the rainy pier at night. Her brother Daniel brings a brass key. Later, in the harbor office, Voss lies about the ledger.";
const outline = () => ({
  title: "The Key",
  scenes: [
    { int_ext: "EXT", location: "PIER", time_of_day: "NIGHT", action: ["MAYA waits in the rain. DANIEL hands her a brass key."], source_excerpt: "Maya waits on the rainy pier at night" },
    { int_ext: "INT", location: "HARBOR OFFICE", time_of_day: "NIGHT", action: ["VOSS lies about the ledger."], source_excerpt: "Voss lies about the ledger" },
  ],
});
const emptyScene = (req: { user: string }) => {
  const first = /^\s*(\d+)\| (.*)$/m.exec(req.user)!;
  return emptyExtraction(Number(first[1]), first[2]);
};

function gatewayFor(handlers: Parameters<typeof routerModel>[0]) {
  const model = routerModel({ story_analysis: minimalStory, story_draft: minimalDraft, verdict: () => ({ conflict: false, confidence: 0.9, reason: "-" }), ...handlers });
  return { model, gateway: new ModelGateway({ extract: ["fake:router"], judge: ["fake:router"] }, () => model) };
}

const extraction = (() => {
  const plan = planExtractor(CLEAN_PLAN, script);
  return async (req: Parameters<typeof plan.generate>[0]) => (await plan.generate(req)).data;
})();

describe("a production that starts from a screenplay", () => {
  it("skips the story chapter and runs the screenplay chapter, then waits for approval", async () => {
    const db = await openDb(":memory:");
    const { gateway } = gatewayFor({ scene_extraction: extraction });
    const id = await createRun(db, { sourceName: "script.fountain", text: script });
    expect(await getRun(db, id)).toMatchObject({ title: "The Keeper's Ledger", inputKind: "screenplay", approvedThrough: 0, storyText: null });

    expect(await runToEnd(db, id, { gateway, judgeSettings })).toEqual({ state: "review" });
    const s = await stages(db, id);
    expect(JSON.parse(s.story_test.reportJson!)).toEqual({ skipped: "This production started from a screenplay." });
    expect(JSON.parse(s.intake.reportJson!) as IntakeReport).toMatchObject({ kind: "screenplay", generated: false });
    expect((JSON.parse(s.continuity.reportJson!) as ContinuityReport).extraction).toMatchObject({ extracted: 10, skipped: 0 });
    expect(s.breakdown.status).toBe("pending"); // locked until the script is approved
  });

  it("runs every chapter to a greenlight when each is approved in turn", async () => {
    const db = await openDb(":memory:");
    const { gateway } = gatewayFor({ scene_extraction: extraction });
    const id = await createRun(db, { sourceName: "script.fountain", text: script });
    expect(await autopilot(db, id, { gateway, judgeSettings })).toEqual({ state: "done" });
    const run = await getRun(db, id);
    expect(run).toMatchObject({ approvedThrough: 5, status: "done", lockedUntil: null });
    expect(Object.values(await stages(db, id)).every((r) => r.status === "done")).toBe(true);
  });
});

describe("a production that starts from a story", () => {
  it("tests the story, then waits for the screenplay choice, then writes and tests the screenplay", async () => {
    const db = await openDb(":memory:");
    const { gateway, model } = gatewayFor({ scene_outline: outline, scene_extraction: emptyScene });
    const id = await createRun(db, { sourceName: "pasted text", title: "The Key", text: STORY });
    expect(await getRun(db, id)).toMatchObject({ inputKind: "story", storyText: STORY, scriptText: null, approvedThrough: -1 });

    expect(await runToEnd(db, id, { gateway, judgeSettings })).toEqual({ state: "review" });
    let s = await stages(db, id);
    expect(JSON.parse(s.story_test.reportJson!)).toMatchObject({ logline: { protagonist: "Maya" }, questions: [{ question: "What does Maya want?" }] });
    expect(s.intake.status).toBe("pending");

    await approveChapter(db, id, 0);
    expect(await runToEnd(db, id, { gateway, judgeSettings })).toEqual({ state: "awaiting", stage: "intake" });
    expect((await stages(db, id)).intake.progress).toMatch(/Choose how the screenplay is made/);

    await writeScriptFromStory(db, id);
    expect(await runToEnd(db, id, { gateway, judgeSettings })).toEqual({ state: "review" });
    const run = await getRun(db, id);
    expect(run).toMatchObject({ scriptGenerated: true, scriptMode: "adapt" });
    expect(run.scriptText).toContain("EXT. PIER - NIGHT");
    s = await stages(db, id);
    expect(JSON.parse(s.intake.reportJson!)).toMatchObject({ generated: true, adaptation: { unsupportedScenes: [] } });
    expect(model.calls.scene_outline).toBe(1);
  });

  it("re-tests an edited story, and only while the story chapter is open", async () => {
    const db = await openDb(":memory:");
    const { gateway, model } = gatewayFor({});
    const id = await createRun(db, { sourceName: "pasted text", text: STORY });
    await runToEnd(db, id, { gateway, judgeSettings });
    await updateStory(db, id, `${STORY} In the end Maya burns the ledger.`);
    expect((await stages(db, id)).story_test.status).toBe("pending");
    await runToEnd(db, id, { gateway, judgeSettings });
    expect(model.calls.story_draft).toBe(2);

    await approveChapter(db, id, 0);
    await expect(updateStory(db, id, "new")).rejects.toThrow(/locked/);
  });

  it("lets the writer provide their own screenplay instead", async () => {
    const db = await openDb(":memory:");
    const { gateway } = gatewayFor({ scene_extraction: extraction });
    const id = await createRun(db, { sourceName: "pasted text", text: STORY });
    await runToEnd(db, id, { gateway, judgeSettings });
    await approveChapter(db, id, 0);
    await setScript(db, id, script);
    expect(await runToEnd(db, id, { gateway, judgeSettings })).toEqual({ state: "review" });
    expect(await getRun(db, id)).toMatchObject({ scriptMode: "own", scriptGenerated: false });
    await expect(setScript(db, id, "Just some prose.")).resolves.toBeUndefined();
    expect(await runToEnd(db, id, { gateway, judgeSettings })).toEqual({ state: "failed", stage: "intake" });
    expect((await stages(db, id)).intake.error).toMatch(/does not read as a screenplay/);
  });
});

describe("approvals", () => {
  it("are given in order, only for finished chapters", async () => {
    const db = await openDb(":memory:");
    const id = await createRun(db, { sourceName: "pasted text", text: STORY });
    await expect(approveChapter(db, id, 1)).rejects.toThrow(/in order/);
    await expect(approveChapter(db, id, 0)).rejects.toThrow(/not finished/);
  });

  it("reopening a chapter clears every later chapter", async () => {
    const db = await openDb(":memory:");
    const { gateway } = gatewayFor({ scene_extraction: extraction });
    const id = await createRun(db, { sourceName: "script.fountain", text: script });
    await autopilot(db, id, { gateway, judgeSettings });
    await reopenChapter(db, id, 2); // the breakdown
    const run = await getRun(db, id);
    expect(run.approvedThrough).toBe(1);
    const s = await stages(db, id);
    expect(s.breakdown.status).toBe("done"); // kept, to review again
    expect([s.locations.status, s.schedule.status, s.budget.status]).toEqual(["pending", "pending", "pending"]);
    await expect(reopenChapter(db, id, 0)).rejects.toThrow(/started from a screenplay/);
    expect(await autopilot(db, id, { gateway, judgeSettings })).toEqual({ state: "done" });
  });
});

describe("the runner", () => {
  it("stops at its time budget and resumes where it left off", async () => {
    const db = await openDb(":memory:");
    const { gateway, model } = gatewayFor({ scene_extraction: extraction });
    const id = await createRun(db, { sourceName: "script.fountain", text: script });
    expect(await stepRun(db, id, { gateway, judgeSettings, budgetMs: 0 })).toEqual({ state: "progress", stage: "story_test" });
    expect(await stepRun(db, id, { gateway, judgeSettings, budgetMs: 0 })).toEqual({ state: "progress", stage: "intake" });
    expect(await stepRun(db, id, { gateway, judgeSettings, budgetMs: 0 })).toEqual({ state: "progress", stage: "story" });
    expect(await stepRun(db, id, { gateway, judgeSettings, budgetMs: 0 })).toEqual({ state: "progress", stage: "continuity" });
    expect((await stages(db, id)).continuity).toMatchObject({ status: "running", progress: "read 0 of 10 scenes" });
    expect(await runToEnd(db, id, { gateway, judgeSettings })).toEqual({ state: "review" });
    expect(model.calls.scene_extraction).toBe(10); // nothing read twice
  });

  it("records a failing stage, stops, and retries on request", async () => {
    const db = await openDb(":memory:");
    const id = await createRun(db, { sourceName: "story.txt", text: "A short story with no scene headings at all." });
    expect(await runToEnd(db, id, { judgeSettings })).toEqual({ state: "review" }); // story test skipped: no model
    await approveChapter(db, id, 0);
    await writeScriptFromStory(db, id);
    expect(await runToEnd(db, id, { judgeSettings })).toEqual({ state: "failed", stage: "intake" });
    expect((await stages(db, id)).intake.error).toMatch(/needs a model/);

    const { gateway } = gatewayFor({
      scene_outline: () => ({ title: "S", scenes: [{ int_ext: "INT", location: "ROOM", time_of_day: "DAY", action: ["Nothing happens."], source_excerpt: "A short story" }] }),
      scene_extraction: emptyScene,
    });
    expect(await stepRun(db, id, { gateway, judgeSettings })).toEqual({ state: "failed", stage: "intake" }); // still failed until retried
    await retryRun(db, id);
    expect(await runToEnd(db, id, { gateway, judgeSettings })).toEqual({ state: "review" });
  });

  it("fails the screenplay chapter when any scene cannot be read, and re-reads only those scenes on retry", async () => {
    const db = await openDb(":memory:");
    let down = true;
    const { gateway, model } = gatewayFor({
      scene_extraction: async (req) => {
        if (down && /Scene (3|7), with line numbers/.test(req.user)) throw new Error("402 out of credits");
        return extraction(req);
      },
    });
    const id = await createRun(db, { sourceName: "script.fountain", text: script });
    expect(await runToEnd(db, id, { gateway, judgeSettings })).toEqual({ state: "failed", stage: "continuity" });
    expect((await stages(db, id)).continuity.error).toMatch(/^2 of 10 scenes could not be read/);
    await expect(approveChapter(db, id, 1)).rejects.toThrow(/not finished/);
    down = false;
    const before = model.calls.scene_extraction;
    await retryRun(db, id);
    expect(await runToEnd(db, id, { gateway, judgeSettings })).toEqual({ state: "review" });
    expect(model.calls.scene_extraction - before).toBe(2);
  });

  it("finishes a screenplay without any model, marking model-only stages as skipped", async () => {
    const db = await openDb(":memory:");
    const id = await createRun(db, { sourceName: "script.fountain", text: script });
    expect(await autopilot(db, id, { judgeSettings })).toEqual({ state: "done" });
    const s = await stages(db, id);
    expect(JSON.parse(s.story.reportJson!)).toEqual({ skipped: "The story read needs a model, and none is configured." });
    expect(JSON.parse(s.continuity.reportJson!)).toMatchObject({ extraction: { model: false } });
  });

  it("lets only one step hold a run at a time", async () => {
    const db = await openDb(":memory:");
    const id = await createRun(db, { sourceName: "script.fountain", text: script });
    await db.update(runs).set({ lockedUntil: Date.now() + 60_000 }).where(eq(runs.id, id));
    expect(await stepRun(db, id, { judgeSettings })).toEqual({ state: "busy" });
  });

  it("rejects empty input", async () => {
    const db = await openDb(":memory:");
    await expect(createRun(db, { sourceName: "x", text: "   " })).rejects.toThrow(/empty/);
  });
});
