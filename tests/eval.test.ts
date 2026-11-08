import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { CHECKS } from "@/lib/checks/index";
import { openDb } from "@/lib/db/client";
import { runEval } from "@/lib/eval/run";
import { parseManifest, score, type SeededError } from "@/lib/eval/score";
import { parseFountain } from "@/lib/fountain";
import { ModelGateway } from "@/lib/llm/gateway";
import { planExtractor, SEEDED_PLAN, CLEAN_PLAN } from "./helpers/placeholder-plan";

const err = (id: string, check: string, scenes: string[], also?: string[]): SeededError => ({ id, check_id: check, scenes, description: id, also_checks: also });
const f = (checkId: string, scenes: string[]) => ({ checkId, sceneNumbers: scenes, title: `${checkId} ${scenes}` });

describe("score", () => {
  it("matches on check and overlapping scenes, one-to-one", () => {
    const r = score([f("a", ["1"]), f("a", ["1"]), f("b", ["9"])], [err("E1", "a", ["1", "2"]), err("E2", "b", ["3"])], ["a", "b"]);
    expect(r).toMatchObject({ tp: 1, fp: 2, fn: 1, precision: 1 / 3, recall: 1 / 2 });
    expect(r.missed.map((e) => e.id)).toEqual(["E2"]);
  });

  it("prefers the largest overlap so neighbouring errors pair up correctly", () => {
    const r = score([f("t", ["5", "8"]), f("t", ["5", "6"])], [err("E9", "t", ["5", "6"]), err("E10", "t", ["8"])], ["t"]);
    expect(r.matches.map((m) => [m.finding.sceneNumbers.join(","), m.errorId])).toEqual([["5,6", "E9"], ["5,8", "E10"]]);
    expect(r.recall).toBe(1);
  });

  it("counts also_checks as hits without requiring them", () => {
    const errors = [err("E5", "change", ["1", "2"], ["sheet"])];
    expect(score([f("change", ["1", "2"]), f("sheet", ["1"])], errors, ["change", "sheet"])).toMatchObject({ tp: 2, fp: 0, recall: 1 });
    expect(score([f("change", ["1", "2"])], errors, ["change", "sheet"])).toMatchObject({ tp: 1, fp: 0, fn: 0 });
  });

  it("leaves errors for unimplemented checks out of recall", () => {
    const r = score([], [err("E1", "a", ["1"]), err("E2", "later", ["2"])], ["a"]);
    expect(r).toMatchObject({ fn: 1, recall: 0, precision: null });
    expect(r.outOfScope.map((e) => e.id)).toEqual(["E2"]);
  });
});

describe("seeded eval set", () => {
  const manifest = parseManifest(fs.readFileSync("data/eval/seeded_errors.yaml", "utf8"));
  const clean = parseFountain(fs.readFileSync("data/script.fountain", "utf8"));
  const seeded = parseFountain(fs.readFileSync("data/eval/script.seeded.fountain", "utf8"));

  it("plants 20 to 30 errors across all eight checks", () => {
    expect(manifest.length).toBeGreaterThanOrEqual(20);
    expect(manifest.length).toBeLessThanOrEqual(30);
    expect(new Set(manifest.map((e) => e.check_id)).size).toBe(8);
  });

  it("keeps the scene structure, and every error points at scenes that were actually edited", () => {
    expect(seeded.scenes.map((s) => s.number)).toEqual(clean.scenes.map((s) => s.number));
    const changed = new Set(seeded.scenes.filter((s, i) => s.text !== clean.scenes[i].text).map((s) => s.number));
    for (const e of manifest) {
      expect(e.scenes.some((n) => changed.has(n)), `${e.id} points at no edited scene`).toBe(true);
    }
  });
});

describe("runEval", () => {
  it("with accurate extraction, the deterministic checks catch every error they own and raise no false alarms", async () => {
    const db = openDb(":memory:");
    const cleanText = fs.readFileSync("data/script.fountain", "utf8");
    const seededText = fs.readFileSync("data/eval/script.seeded.fountain", "utf8");
    const cleanModel = planExtractor(CLEAN_PLAN, cleanText);
    const seededModel = planExtractor(SEEDED_PLAN, seededText);
    // Unchanged scenes are identical in both scripts; edited scenes only exist in the seeded one.
    const sceneText = (prompt: string) =>
      prompt
        .split("with line numbers:\n")[1]
        .split("\n\nExtract the continuity facts")[0]
        .replace(/^\s*\d+\| /gm, "");
    const gateway = new ModelGateway({ extract: ["fake:plan"], judge: [] }, () => ({
      spec: "fake:plan",
      generate: (req) => (cleanText.includes(sceneText(req.user)) ? cleanModel : seededModel).generate(req),
    }));

    const report = await runEval(db, gateway, {
      clean: { name: "script.fountain", text: cleanText },
      seeded: { name: "script.seeded.fountain", text: seededText },
      costumes: { name: "costumes.csv", text: fs.readFileSync("data/costumes.csv", "utf8") },
      locations: { name: "locations.csv", text: fs.readFileSync("data/locations.csv", "utf8") },
      manifest: parseManifest(fs.readFileSync("data/eval/seeded_errors.yaml", "utf8")),
    });

    expect(report.clean.falseAlarms).toBe(0);
    expect(report.pipeline.droppedItems).toBe(0);
    expect(report.seeded.falseAlarms.map((x) => x.title)).toEqual([]);
    expect(report.seeded.missed.map((e) => e.id)).toEqual([]);
    expect(report.seeded).toMatchObject({ precision: 1, recall: 1 });
    expect(report.checks).toEqual(CHECKS.map((c) => c.id));
  });
});
