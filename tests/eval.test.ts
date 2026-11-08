import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { CHECKS } from "@/lib/checks/index";
import { openDb } from "@/lib/db/client";
import { runEval } from "@/lib/eval/run";
import { parseManifest, score, type SeededError } from "@/lib/eval/score";
import { parseFountain } from "@/lib/fountain";
import { ModelGateway } from "@/lib/llm/gateway";
import type { StructuredRequest } from "@/lib/llm/types";
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

const cleanText = fs.readFileSync("data/script.fountain", "utf8");
const seededText = fs.readFileSync("data/eval/script.seeded.fountain", "utf8");
const evalInput = () => ({
  clean: { name: "script.fountain", text: cleanText },
  seeded: { name: "script.seeded.fountain", text: seededText },
  costumes: { name: "costumes.csv", text: fs.readFileSync("data/costumes.csv", "utf8") },
  locations: { name: "locations.csv", text: fs.readFileSync("data/locations.csv", "utf8") },
  manifest: parseManifest(fs.readFileSync("data/eval/seeded_errors.yaml", "utf8")),
});

/** Extraction follows the scene plans; the judge (if any) is a scripted stand-in. */
function planGateway(judgeAnswer?: (prompt: string) => { conflict: boolean; confidence: number; reason: string }) {
  const cleanModel = planExtractor(CLEAN_PLAN, cleanText);
  const seededModel = planExtractor(SEEDED_PLAN, seededText);
  // Unchanged scenes are identical in both scripts; edited scenes only exist in the seeded one.
  const sceneText = (prompt: string) =>
    prompt
      .split("with line numbers:\n")[1]
      .split("\n\nExtract the continuity facts")[0]
      .replace(/^\s*\d+\| /gm, "");
  const judged: string[] = [];
  const gateway = new ModelGateway({ extract: ["fake:plan"], judge: judgeAnswer ? ["fake:judge"] : [] }, (spec) =>
    spec === "fake:judge"
      ? {
          spec,
          generate: async <T,>(req: StructuredRequest<T>) => {
            judged.push(req.user);
            return { data: req.schema.parse(judgeAnswer!(req.user)), model: spec, usage: {} };
          },
        }
      : { spec, generate: (req) => (cleanText.includes(sceneText(req.user)) ? cleanModel : seededModel).generate(req) },
  );
  return { gateway, judged };
}

describe("runEval", () => {
  it("without a judge: deterministic checks catch every error they own, with no false alarms", async () => {
    const { gateway } = planGateway();
    const report = await runEval(openDb(":memory:"), gateway, evalInput());

    expect(report.checks).toEqual(CHECKS.map((c) => c.id));
    expect(report.clean.falseAlarms).toBe(0);
    expect(report.pipeline.droppedItems).toBe(0);
    expect(report.seeded.falseAlarms.map((x) => x.title)).toEqual([]);
    expect(report.seeded.precision).toBe(1);
    // Only errors that need a judge are missed (E14, not-on-sheet, is deterministic).
    expect(report.seeded.missed.map((e) => e.id)).toEqual(["E07", "E08", "E11", "E12", "E13", "E15", "E16", "E17"]);
    expect(report.judge.unjudged).toBeGreaterThan(0);
  });

  it("candidate generation reaches every planted error (a judge that always agrees gets full recall)", async () => {
    const { gateway, judged } = planGateway(() => ({ conflict: true, confidence: 0.9, reason: "stand-in" }));
    const report = await runEval(openDb(":memory:"), gateway, evalInput());
    expect(report.seeded.missed.map((e) => e.id)).toEqual([]);
    expect(report.seeded.recall).toBe(1);
    // The noise budget the real judge has to filter: candidates raised on the clean script.
    expect(report.clean.falseAlarms).toBeLessThanOrEqual(3);
    expect(judged.length).toBe(report.judge.candidates);
  });

  it("a judge that rejects everything adds no findings, and verdicts are cached", async () => {
    const db = openDb(":memory:");
    const first = planGateway(() => ({ conflict: false, confidence: 0.9, reason: "not a conflict" }));
    const r1 = await runEval(db, first.gateway, evalInput());
    expect(r1.judge.accepted).toBe(0);
    expect(r1.seeded.falseAlarms).toEqual([]);
    const second = planGateway(() => ({ conflict: false, confidence: 0.9, reason: "not a conflict" }));
    await runEval(db, second.gateway, evalInput());
    expect(second.judged).toEqual([]);
  });
});
