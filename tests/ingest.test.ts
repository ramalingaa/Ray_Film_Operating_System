import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { eq } from "drizzle-orm";
import { openDb } from "@/lib/db/client";
import { entities, entityMerges, facts, pipelineIssues, scenes } from "@/lib/db/schema";
import { Ledger } from "@/lib/agents/runtime";
import { ModelGateway } from "@/lib/llm/gateway";
import { ingest } from "@/lib/pipeline/ingest";
import { emptyExtraction, fakeExtractModel } from "./helpers/fake-model";

const input = {
  script: { name: "script.fountain", text: fs.readFileSync("data/script.fountain", "utf8") },
  costumes: { name: "costumes.csv", text: fs.readFileSync("data/costumes.csv", "utf8") },
  locations: { name: "locations.csv", text: fs.readFileSync("data/locations.csv", "utf8") },
};

function model() {
  return fakeExtractModel((n, line, heading) => {
    const x = emptyExtraction(line, heading);
    if (n === "1") {
      x.characters = [{ name: "Maya Reyes", speaking: true, source_line: 10, source_snippet: "MAYA REYES (30s), green raincoat" }];
      x.costumes = [
        { character: "MAYA REYES", garment: "green raincoat", state: "normal", state_detail: null, changes_into: false, source_line: 10, source_snippet: "green raincoat over a grey sweater" },
        // Hallucination: not in the scene. Must be dropped.
        { character: "MAYA REYES", garment: "purple boots", state: "normal", state_detail: null, changes_into: false, source_line: 10, source_snippet: "purple boots splash" },
      ];
      x.props = [{ name: "brass key", action: "introduced", holder: "DANIEL", state: null, fixed_in_place: false, source_line: 12, source_snippet: "small brass key" }];
    }
    if (n === "9") {
      x.props = [{ name: "ledger", action: "destroyed", holder: null, state: "ash", fixed_in_place: false, source_line: 99, source_snippet: "Within seconds it is ash" }];
    }
    return x;
  });
}

describe("ingest", () => {
  it("stores scenes, sheet facts and verified model facts with provenance", async () => {
    const db = await openDb(":memory:");
    const fake = model();
    const ctx = { db, ledger: new Ledger(db), gateway: new ModelGateway({ extract: ["fake:extractor"], judge: [] }, () => fake) };
    const report = await ingest(ctx, input);

    expect(report).toMatchObject({ sceneCount: 10, extractedScenes: 10, cachedScenes: 0, skippedScenes: 0, droppedItems: 1 });
    expect(fake.calls).toBe(10);

    const all = (await db.select().from(facts));
    expect(all.length).toBe(report.factCount);
    for (const f of all) {
      expect(f.sourceLine).toBeGreaterThan(0);
      expect(f.sourceSnippet.trim().length).toBeGreaterThan(0);
      expect(f.sourceSnippet.split(/\s+/).length).toBeLessThanOrEqual(25);
    }
    expect(all.some((f) => f.objectValue === "purple boots")).toBe(false);
    const dropped = (await db.select().from(pipelineIssues).where(eq(pipelineIssues.stage, "verify")));
    expect(dropped[0].message).toContain("purple boots");

    // The ledger line pointer was wrong (99) and got corrected to the real line.
    const ash = all.find((f) => f.kind === "prop_state" && f.predicate === "destroyed")!;
    expect(ash.sourceLine).toBe(109);

    // Entities: cue MAYA, model "Maya Reyes" and sheet MAYA REYES resolve to one person.
    const maya = (await db.select().from(entities).where(eq(entities.canonicalName, "MAYA REYES")))[0]!;
    expect(JSON.parse(maya.aliasesJson)).toContain("MAYA");
    expect((await db.select().from(entityMerges)).length).toBeGreaterThan(0);

    // Story days: day 1 until SUPER: DAY 2, flashback unknown.
    const days = (await db.select().from(facts).where(eq(facts.kind, "story_day"))).map((f) => f.objectValue);
    expect(days).toEqual(["1", "1", "1", "1", "1", "2", "unknown", "2", "2", "2"]);
  });

  it("re-running the same script costs zero model calls", async () => {
    const db = await openDb(":memory:");
    const fake = model();
    const ctx = { db, ledger: new Ledger(db), gateway: new ModelGateway({ extract: ["fake:extractor"], judge: [] }, () => fake) };
    await ingest(ctx, input);
    const first = (await db.select().from(facts)).length;
    fake.calls = 0;
    const again = await ingest(ctx, input);
    expect(fake.calls).toBe(0);
    expect(again.cachedScenes).toBe(10);
    expect((await db.select().from(facts)).length).toBe(first);
    expect((await db.select().from(scenes)).length).toBe(10);
  });

  it("runs deterministic-only without a model and says so", async () => {
    const db = await openDb(":memory:");
    const report = await ingest({ db, ledger: new Ledger(db) }, input);
    expect(report.extractedScenes).toBe(0);
    expect(report.factCount).toBeGreaterThan(30);
    const issues = (await db.select().from(pipelineIssues));
    expect(issues.some((i) => i.message.includes("no model configured"))).toBe(true);
  });
});
