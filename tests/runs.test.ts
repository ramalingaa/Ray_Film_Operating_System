import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { eq } from "drizzle-orm";
import { openDb } from "@/lib/db/client";
import { runs, runStages } from "@/lib/db/schema";
import { ModelGateway } from "@/lib/llm/gateway";
import { createRun, retryRun, runToEnd, stepRun } from "@/lib/pipeline/runs";
import type { ContinuityReport } from "@/lib/stages/continuity";
import type { IntakeReport } from "@/lib/stages/intake";
import { emptyExtraction } from "./helpers/fake-model";
import { CLEAN_PLAN, planExtractor } from "./helpers/placeholder-plan";
import { routerModel } from "./helpers/router-model";

const script = fs.readFileSync("data/script.fountain", "utf8");
const judgeSettings = { policy: "primary" as const, threshold: 0.7 };

async function stages(db: Awaited<ReturnType<typeof openDb>>, runId: number) {
  const rows = await db.select().from(runStages).where(eq(runStages.runId, runId)).orderBy(runStages.ordinal);
  return Object.fromEntries(rows.map((r) => [r.stage, r]));
}

/** A minimal story read: no beats or cards, citing the first scene heading. */
const minimalStory = (req: { user: string }) => {
  const m = /^\s*(\d+)\| ((?:INT|EXT).*)$/m.exec(req.user)!;
  return {
    logline: { protagonist: null, goal: null, stakes: null, obstacle: null, one_sentence: "-", missing: [], source_line: Number(m[1]), source_snippet: m[2] },
    beats: [],
    scenes: [],
    setups: [],
  };
};

function gatewayFor(handlers: Parameters<typeof routerModel>[0]) {
  const model = routerModel({ story_analysis: minimalStory, ...handlers });
  return { model, gateway: new ModelGateway({ extract: ["fake:router"], judge: ["fake:router"] }, () => model) };
}

const extraction = (() => {
  const plan = planExtractor(CLEAN_PLAN, script);
  return async (req: Parameters<typeof plan.generate>[0]) => (await plan.generate(req)).data;
})();

describe("runs", () => {
  it("takes a screenplay through intake and continuity, with reports for each", async () => {
    const db = await openDb(":memory:");
    const { gateway } = gatewayFor({ scene_extraction: extraction, verdict: () => ({ conflict: false, confidence: 0.9, reason: "no conflict" }) });
    const id = await createRun(db, { sourceName: "script.fountain", text: script });
    const [run] = await db.select().from(runs).where(eq(runs.id, id));
    expect(run).toMatchObject({ title: "The Keeper's Ledger", inputKind: "screenplay" });

    expect(await runToEnd(db, id, { gateway, judgeSettings })).toEqual({ state: "done" });
    const s = await stages(db, id);
    const intake = JSON.parse(s.intake.reportJson!) as IntakeReport;
    expect(intake).toMatchObject({ kind: "screenplay", generated: false, warnings: [] });
    expect(intake.scenes).toHaveLength(10);
    const continuity = JSON.parse(s.continuity.reportJson!) as ContinuityReport;
    expect(continuity.extraction).toMatchObject({ extracted: 10, skipped: 0 });
    expect(continuity.findings.open).toBe(0);
    const [after] = await db.select().from(runs).where(eq(runs.id, id));
    expect(after).toMatchObject({ status: "done", lockedUntil: null, scriptDocId: continuity.docId });
  });

  it("adapts a story into a generated outline and continues on it", async () => {
    const db = await openDb(":memory:");
    const story = "Maya waits on the rainy pier at night. Her brother Daniel brings a brass key. Later, in the harbor office, Voss lies about the ledger.";
    const { gateway, model } = gatewayFor({
      scene_outline: () => ({
        title: "The Key",
        scenes: [
          { int_ext: "EXT", location: "PIER", time_of_day: "NIGHT", action: ["MAYA waits in the rain. DANIEL hands her a brass key."], source_excerpt: "Maya waits on the rainy pier at night" },
          { int_ext: "INT", location: "HARBOR OFFICE", time_of_day: "NIGHT", action: ["VOSS lies about the ledger."], source_excerpt: "Voss lies about the ledger" },
        ],
      }),
      scene_extraction: (req) => {
        const first = /^\s*(\d+)\| (.*)$/m.exec(req.user)!;
        return emptyExtraction(Number(first[1]), first[2]);
      },
    });
    const id = await createRun(db, { sourceName: "pasted text", title: "The Key", text: story });
    expect(await runToEnd(db, id, { gateway, judgeSettings })).toEqual({ state: "done" });
    const [run] = await db.select().from(runs).where(eq(runs.id, id));
    expect(run).toMatchObject({ inputKind: "story", scriptGenerated: true });
    expect(run.scriptText).toContain("EXT. PIER - NIGHT");
    const intake = JSON.parse((await stages(db, id)).intake.reportJson!) as IntakeReport;
    expect(intake).toMatchObject({ kind: "story", generated: true, adaptation: { unsupportedScenes: [] } });
    expect(model.calls.scene_outline).toBe(1);
  });

  it("stops at its time budget and resumes where it left off", async () => {
    const db = await openDb(":memory:");
    const { gateway, model } = gatewayFor({ scene_extraction: extraction, verdict: () => ({ conflict: false, confidence: 0.9, reason: "-" }) });
    const id = await createRun(db, { sourceName: "script.fountain", text: script });
    expect(await stepRun(db, id, { gateway, judgeSettings, budgetMs: 0 })).toEqual({ state: "progress", stage: "intake" });
    expect(await stepRun(db, id, { gateway, judgeSettings, budgetMs: 0 })).toEqual({ state: "progress", stage: "story" });
    expect(await stepRun(db, id, { gateway, judgeSettings, budgetMs: 0 })).toEqual({ state: "progress", stage: "continuity" });
    const s = await stages(db, id);
    expect(s.continuity).toMatchObject({ status: "running", progress: "read 0 of 10 scenes" });
    expect(await runToEnd(db, id, { gateway, judgeSettings })).toEqual({ state: "done" });
    expect(model.calls.scene_extraction).toBe(10); // nothing read twice
  });

  it("records a failing stage, stops, and retries on request", async () => {
    const db = await openDb(":memory:");
    const id = await createRun(db, { sourceName: "story.txt", text: "A short story with no scene headings at all." });
    expect(await runToEnd(db, id, { judgeSettings })).toEqual({ state: "failed", stage: "intake" });
    const s = await stages(db, id);
    expect(s.intake.error).toMatch(/needs a model/);
    expect(s.continuity.status).toBe("pending");

    const { gateway } = gatewayFor({
      scene_outline: () => ({ title: "S", scenes: [{ int_ext: "INT", location: "ROOM", time_of_day: "DAY", action: ["Nothing happens."], source_excerpt: "A short story" }] }),
      scene_extraction: (req) => emptyExtraction(Number(/^\s*(\d+)\|/m.exec(req.user)![1]), "INT. ROOM - DAY"),
    });
    expect(await stepRun(db, id, { gateway, judgeSettings })).toEqual({ state: "failed", stage: "intake" }); // still failed until retried
    await retryRun(db, id);
    expect(await runToEnd(db, id, { gateway, judgeSettings })).toEqual({ state: "done" });
  });

  it("finishes a screenplay without any model, marking model-only stages as skipped", async () => {
    const db = await openDb(":memory:");
    const id = await createRun(db, { sourceName: "script.fountain", text: script });
    expect(await runToEnd(db, id, { judgeSettings })).toEqual({ state: "done" });
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
