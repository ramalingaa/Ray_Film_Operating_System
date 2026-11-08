import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { Ledger } from "@/lib/agents/runtime";
import { runChecks } from "@/lib/checks/run";
import { openDb } from "@/lib/db/client";
import { applySceneEdit, applyScriptEdit } from "@/lib/impact/apply";
import { computeImpact, replaceSceneText } from "@/lib/impact/impact";
import { parseFountain } from "@/lib/fountain";
import { ModelGateway } from "@/lib/llm/gateway";
import { ingest } from "@/lib/pipeline/ingest";
import { CLEAN_PLAN, planExtractor, type ScenePlan } from "./helpers/placeholder-plan";

const clean = fs.readFileSync("data/script.fountain", "utf8");
const sheets = {
  costumes: { name: "costumes.csv", text: fs.readFileSync("data/costumes.csv", "utf8") },
  locations: { name: "locations.csv", text: fs.readFileSync("data/locations.csv", "utf8") },
};

/** A store with the clean script ingested and checked, and an extractor that knows the edited scene 4. */
async function setup() {
  const db = await openDb(":memory:");
  const edited: ScenePlan = { ...CLEAN_PLAN, "4": { costumes: [["DANIEL", "torn suit jacket", "torn"], ["MAYA", "yellow raincoat"]] } };
  const editedText = clean.replace("Maya, still in her green raincoat, floors it.", "Maya, still in her yellow raincoat, floors it.");
  const cleanModel = planExtractor(CLEAN_PLAN, clean);
  const editedModel = planExtractor(edited, editedText);
  let useEdited = false;
  const gateway = new ModelGateway({ extract: ["fake:plan"], judge: [] }, () => ({
    spec: "fake:plan",
    generate: (req) => (useEdited ? editedModel : cleanModel).generate(req),
  }));
  const ctx = { db, ledger: new Ledger(db), gateway };
  const base = await ingest(ctx, { script: { name: "script.fountain", text: clean }, ...sheets });
  await runChecks(db, base.scriptDocId);
  return { db, ctx, baseId: base.scriptDocId, editedText, editedModel, useEdited: () => (useEdited = true) };
}

describe("replaceSceneText", () => {
  it("swaps exactly the scene's lines", () => {
    const raw = "a\nb\nc\nd\ne";
    expect(replaceSceneText(raw, { startLine: 2, endLine: 3 }, "X\nY\nZ\n")).toBe("a\nX\nY\nZ\nd\ne");
  });
});

describe("change impact", () => {
  it("reports the edited scene, the facts that moved, what they touch, and the new finding", async () => {
    const s = await setup();
    s.useEdited();
    const r = await applyScriptEdit(s.ctx, s.baseId, s.editedText);

    expect(r.modelCalls).toEqual({ extractedScenes: 1, cachedScenes: 9 });
    expect(r.scenes).toEqual([{ number: "4", heading: "EXT. HARBOR ROAD - CONTINUOUS", kind: "changed" }]);
    expect(r.facts.removed.map((f) => [f.sceneNumber, f.subject, f.value])).toEqual([["4", "MAYA REYES", "green raincoat"]]);
    expect(r.facts.added.map((f) => [f.sceneNumber, f.subject, f.value])).toEqual([["4", "MAYA REYES", "yellow raincoat"]]);

    const labels = r.touches.map((t) => t.label);
    expect(labels).toContain("costume row for MAYA REYES (scenes 1, 2, 3, 4, 5)");
    expect(labels).toContain("scene 5 (MAYA REYES)");
    expect(labels).not.toContain("scene 1 (MAYA REYES)"); // earlier scenes are not downstream
    const row = r.touches.find((t) => t.kind === "costume_row" && t.because === "MAYA REYES" && t.source.line === 2);
    expect(row?.source.docName).toBe("costumes.csv");

    expect(r.findings.added.map((f) => f.checkId)).toEqual(["costume_sheet_mismatch"]);
    expect(r.findings).toMatchObject({ resolved: [], unchanged: 0 });
    expect(r.summary).toMatch(/^You changed scene 4\. This touches: .*costume row for MAYA REYES .*costumes\.csv line 2.*\. It creates 1 new finding and resolves 0\.$/);
  });

  it("an edit to one scene's text gives the same result, and reverting resolves the finding", async () => {
    const s = await setup();
    s.useEdited();
    const scene4 = parseFountain(s.editedText).scenes[3];
    const forward = await applySceneEdit(s.ctx, s.baseId, "4", scene4.text);
    expect(forward.findings.added).toHaveLength(1);

    const back = await applyScriptEdit(s.ctx, forward.to.id, clean);
    expect(back.findings.resolved.map((f) => f.checkId)).toEqual(["costume_sheet_mismatch"]);
    expect(back.modelCalls.extractedScenes).toBe(0); // the original scene 4 is still cached
  });

  it("reports added and removed scenes, and any two stored versions can be compared", async () => {
    const s = await setup();
    const withoutLast = clean.slice(0, clean.indexOf("EXT. LIGHTHOUSE - NIGHT")).trimEnd() + "\n";
    const r = await applyScriptEdit(s.ctx, s.baseId, withoutLast);
    expect(r.scenes).toEqual([{ number: "10", heading: "EXT. LIGHTHOUSE - NIGHT", kind: "removed" }]);
    expect(r.summary).toContain("You removed scene 10.");

    const reverse = (await computeImpact(s.db, r.to.id, s.baseId));
    expect(reverse.scenes).toEqual([{ number: "10", heading: "EXT. LIGHTHOUSE - NIGHT", kind: "added" }]);
  });

  it("reports story-day shifts and only the sheet rows they reach", async () => {
    const s = await setup();
    const r = await applyScriptEdit(s.ctx, s.baseId, clean.replace("SUPER: DAY 2\n\n", ""));
    expect(r.scenes.map((x) => x.number)).toEqual(["6"]);
    // Scene 6 loses its day marker, so it and the scenes after it fall back to day 1.
    expect(r.touches.filter((t) => t.kind === "day_shift").map((t) => t.label)).toEqual([
      "scene 6 moves from day 2 to day 1",
      "scene 8 moves from day 2 to day 1",
      "scene 9 moves from day 2 to day 1",
      "scene 10 moves from day 2 to day 1",
    ]);
    // Only the facts that really changed are listed (the SUPER line itself is not a fact here).
    expect(r.facts.added).toEqual([]);
    expect(r.facts.removed).toEqual([]);
    const rows = r.touches.filter((t) => t.kind === "costume_row").map((t) => t.label);
    expect(rows).toContain("costume row for MAYA REYES (scenes 6, 7, 8)");
    expect(rows).not.toContain("costume row for MAYA REYES (scenes 1, 2, 3, 4, 5)");
  });

  it("says so when nothing changed", async () => {
    const s = await setup();
    const r = (await computeImpact(s.db, s.baseId, s.baseId));
    expect(r.summary).toBe("No changes between version 1 and version 1.");
  });
});
