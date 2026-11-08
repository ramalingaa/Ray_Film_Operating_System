import { describe, expect, it } from "vitest";
import { Ledger } from "@/lib/agents/runtime";
import { characterKnowledge, contentWords } from "@/lib/checks/character-knowledge";
import { costumeStateCarryover } from "@/lib/checks/costume-state-carryover";
import { decide, judge, judgeSettingsFromEnv, type Vote } from "@/lib/checks/judge";
import { locationConsistency } from "@/lib/checks/location-consistency";
import { timeOfDayConflict } from "@/lib/checks/time-of-day-conflict";
import { openDb } from "@/lib/db/client";
import { pipelineIssues } from "@/lib/db/schema";
import { ModelGateway } from "@/lib/llm/gateway";
import type { ModelAdapter, StructuredRequest } from "@/lib/llm/types";
import { BibleBuilder } from "./helpers/bible";

const vote = (model: string, conflict: boolean, confidence = 0.9): Vote => ({ model, conflict, confidence, reason: `${model} says ${conflict}` });

describe("decide", () => {
  const t = 0.7;
  it("primary: the first model decides", () => {
    expect(decide([vote("a", true), vote("b", false)], { policy: "primary", threshold: t }).accepted).toBe(true);
    expect(decide([vote("a", false), vote("b", true)], { policy: "primary", threshold: t }).accepted).toBe(false);
  });
  it("unanimous needs every judge; majority needs more than half", () => {
    const votes = [vote("a", true), vote("b", true), vote("c", false)];
    expect(decide(votes, { policy: "unanimous", threshold: t }).accepted).toBe(false);
    expect(decide(votes, { policy: "majority", threshold: t })).toMatchObject({ accepted: true, confidence: 0.9 });
  });
  it("ignores yes-votes below the confidence threshold", () => {
    expect(decide([vote("a", true, 0.6)], { policy: "primary", threshold: t }).accepted).toBe(false);
    expect(decide([vote("a", true, 0.7)], { policy: "primary", threshold: t }).accepted).toBe(true);
  });
  it("validates settings from env", () => {
    expect(judgeSettingsFromEnv({})).toEqual({ policy: "primary", threshold: 0.7 });
    expect(() => judgeSettingsFromEnv({ JUDGE_POLICY: "vibes" })).toThrow(/JUDGE_POLICY/);
    expect(() => judgeSettingsFromEnv({ JUDGE_CONFIDENCE_THRESHOLD: "2" })).toThrow(/between 0 and 1/);
  });
});

describe("judge agent", () => {
  const candidate = { checkId: "x", severity: "medium" as const, title: "t", explanation: "e", evidence: "ev", factIds: [], sceneNumbers: ["1"], signatureParts: [] };
  const check = { ...timeOfDayConflict };

  function judgeModel(spec: string, answer: { conflict: boolean; confidence: number } | Error): ModelAdapter & { calls: number } {
    const m = {
      spec,
      calls: 0,
      async generate<T>(req: StructuredRequest<T>) {
        m.calls++;
        if (answer instanceof Error) throw answer;
        return { data: req.schema.parse({ ...answer, reason: spec }), model: spec, usage: {} };
      },
    };
    return m;
  }

  it("runs an ensemble, logs a judge that fails, and caches verdicts", async () => {
    const db = await openDb(":memory:");
    const models = { "x:a": judgeModel("x:a", { conflict: true, confidence: 0.9 }), "x:b": judgeModel("x:b", new Error("503")), "x:c": judgeModel("x:c", { conflict: true, confidence: 0.8 }) };
    const ctx = { db, ledger: new Ledger(db), gateway: new ModelGateway({ extract: [], judge: Object.keys(models) }, (s) => models[s as keyof typeof models]) };
    const d = await judge(ctx, check, candidate, { policy: "unanimous", threshold: 0.7 });
    expect(d).toMatchObject({ accepted: true, confidence: 0.8 });
    expect(d!.votes.map((v) => v.model)).toEqual(["x:a", "x:c"]);
    const issues = (await db.select().from(pipelineIssues)).map((i) => i.message);
    expect(issues.some((m) => m.includes("x:b gave no verdict"))).toBe(true);
    expect(issues.some((m) => m.includes("only 2 of 3 judges answered"))).toBe(true);

    await judge(ctx, check, candidate, { policy: "unanimous", threshold: 0.7 });
    expect(models["x:a"].calls).toBe(1); // cached
  });

  it("returns undefined (and records it) when no judge answers", async () => {
    const db = await openDb(":memory:");
    const ctx = { db, ledger: new Ledger(db), gateway: new ModelGateway({ extract: [], judge: ["x:b"] }, () => judgeModel("x:b", new Error("down"))) };
    expect(await judge(ctx, check, candidate, { policy: "primary", threshold: 0.7 })).toBeUndefined();
    expect((await db.select().from(pipelineIssues)).some((i) => i.severity === "error")).toBe(true);
  });
});

describe("costume_state_carryover candidates", () => {
  it("pairs a damaged garment with an undamaged one later the same day", () => {
    const b = new BibleBuilder().scene("3").scene("4", { time: "CONTINUOUS" });
    b.wears("3", "DANIEL", "suit jacket", { state: "torn" });
    b.wears("4", "DANIEL", "suit jacket", { state: "normal" });
    const c = costumeStateCarryover.candidates(b.build());
    expect(c).toHaveLength(1);
    expect(c[0].evidence).toContain("torn");
  });
  it("skips carried damage, a change of clothes, a new day, and different garments", () => {
    const b = new BibleBuilder().scene("1").scene("2").scene("3", { day: 2 }).scene("4", { day: 2 }).scene("5", { day: 2 });
    b.wears("1", "D", "suit jacket", { state: "torn" });
    b.wears("2", "D", "torn suit jacket", { state: "torn" }); // carried
    b.wears("3", "D", "suit", { state: "normal" }); // next day
    b.wears("3", "M", "raincoat", { state: "wet" });
    b.wears("4", "M", "raincoat", { state: "normal", changesInto: true }); // changed on screen
    b.wears("4", "D", "suit", { state: "bloody" });
    b.wears("5", "D", "white shirt", { state: "normal" }); // different garment
    expect(costumeStateCarryover.candidates(b.build())).toEqual([]);
  });
});

describe("time_of_day_conflict candidates", () => {
  it("compares implied time with the heading, following CONTINUOUS back", () => {
    const b = new BibleBuilder().scene("1", { time: "NIGHT" }).scene("2", { time: "CONTINUOUS" });
    b.fact({ scene: "2", kind: "time_of_day", predicate: "implied_time", object: "day" });
    const c = timeOfDayConflict.candidates(b.build());
    expect(c).toHaveLength(1);
    expect(c[0].evidence).toContain("continuing scene 1");
  });
  it("leaves neighbouring and matching times alone", () => {
    const b = new BibleBuilder().scene("1", { time: "DUSK" }).scene("2", { time: "MORNING" }).scene("3", { time: "UNKNOWN" });
    b.fact({ scene: "1", kind: "time_of_day", predicate: "implied_time", object: "evening" });
    b.fact({ scene: "2", kind: "time_of_day", predicate: "implied_time", object: "dawn" });
    b.fact({ scene: "3", kind: "time_of_day", predicate: "implied_time", object: "night" });
    expect(timeOfDayConflict.candidates(b.build())).toEqual([]);
  });
});

describe("location_consistency", () => {
  function withSheet() {
    const b = new BibleBuilder().scene("1", { location: "APARTMENT" }).scene("2", { location: "APARTMENT" }).scene("3", { location: "MOON BASE" });
    b.fact({ kind: "located_at", subject: "APARTMENT", predicate: "sheet_location", object: "Third-floor walk-up", attrs: { intExt: "INT" }, doc: "locations.csv" });
    for (const n of ["1", "2", "3"]) {
      b.fact({ scene: n, kind: "located_at", subject: n === "3" ? "MOON BASE" : "APARTMENT", predicate: "scene_location", object: n, attrs: { intExt: n === "2" ? "EXT" : "INT" } });
    }
    return b;
  }
  it("deterministically flags locations missing from the sheet and INT/EXT mismatches", () => {
    const out = locationConsistency.deterministic!(withSheet().build());
    expect(out.map((f) => [f.severity, f.sceneNumbers])).toEqual([
      ["low", ["2"]],
      ["medium", ["3"]],
    ]);
  });
  it("stays silent without a location sheet", () => {
    const b = new BibleBuilder().scene("1", { location: "ANYWHERE" });
    b.fact({ scene: "1", kind: "located_at", subject: "ANYWHERE", predicate: "scene_location", object: "1" });
    expect(locationConsistency.deterministic!(b.build())).toEqual([]);
  });
  it("pairs each described scene with the sheet notes and the previous description", () => {
    const b = withSheet();
    b.fact({ scene: "1", kind: "located_at", subject: "APARTMENT", predicate: "location_detail", object: "third-floor walk-up" });
    b.fact({ scene: "2", kind: "located_at", subject: "APARTMENT", predicate: "location_detail", object: "ground-floor studio" });
    const c = locationConsistency.candidates(b.build());
    expect(c.map((x) => x.sceneNumbers)).toEqual([["1"], ["2"], ["1", "2"]]);
  });
});

describe("character_knowledge candidates", () => {
  it("pairs a reference with a later learning of related information", () => {
    const b = new BibleBuilder().scene("1").scene("2").scene("5");
    b.fact({ scene: "1", kind: "references_fact", subject: "MAYA", predicate: "references", object: "the ledger is in the lighthouse" });
    b.fact({ scene: "5", kind: "learns_fact", subject: "MAYA", predicate: "learns", object: "the ledger is hidden in the old lighthouse" });
    b.fact({ scene: "2", kind: "learns_fact", subject: "MAYA", predicate: "learns", object: "Voss ran the smuggling" }); // unrelated
    const c = characterKnowledge.candidates(b.build());
    expect(c.map((x) => x.sceneNumbers)).toEqual([["1", "5"]]);
  });
  it("ignores learning before the reference, other characters, and flashbacks", () => {
    const b = new BibleBuilder().scene("1").scene("2").scene("3", { flashback: true });
    b.fact({ scene: "1", kind: "learns_fact", subject: "MAYA", predicate: "learns", object: "the ledger is in the lighthouse" });
    b.fact({ scene: "2", kind: "references_fact", subject: "MAYA", predicate: "references", object: "the ledger" });
    b.fact({ scene: "2", kind: "references_fact", subject: "OKAFOR", predicate: "references", object: "the lighthouse" });
    b.fact({ scene: "3", kind: "learns_fact", subject: "OKAFOR", predicate: "learns", object: "the lighthouse is abandoned" });
    expect(characterKnowledge.candidates(b.build())).toEqual([]);
  });
  it("uses content words, not stop words, to relate facts", () => {
    expect([...contentWords("She knows that the ledger's hidden there")]).toEqual(["ledger"]);
  });
});
