import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { eq } from "drizzle-orm";
import { isMinor, statedAges } from "@/lib/breakdown/rules";
import { openDb } from "@/lib/db/client";
import { runStages } from "@/lib/db/schema";
import { parseFountain } from "@/lib/fountain";
import { ModelGateway } from "@/lib/llm/gateway";
import { createRun, runToEnd } from "@/lib/pipeline/runs";
import type { BreakdownReport } from "@/lib/stages/breakdown";
import type { LocationsReport } from "@/lib/stages/locations";
import { CLEAN_PLAN, planExtractor } from "./helpers/placeholder-plan";
import { routerModel } from "./helpers/router-model";

const script = fs.readFileSync("data/script.fountain", "utf8");
const sheets = {
  costumes: { name: "costumes.csv", text: fs.readFileSync("data/costumes.csv", "utf8") },
  locations: { name: "locations.csv", text: fs.readFileSync("data/locations.csv", "utf8") },
};
const judgeSettings = { policy: "primary" as const, threshold: 0.7 };

async function runSample(text = script, extraSheets: Partial<typeof sheets> = sheets) {
  const db = await openDb(":memory:");
  const plan = planExtractor(CLEAN_PLAN, text);
  const model = routerModel({
    scene_extraction: async (req) => (await plan.generate(req)).data,
    verdict: () => ({ conflict: false, confidence: 0.9, reason: "-" }),
    story_analysis: () => ({
      logline: { protagonist: null, goal: null, stakes: null, obstacle: null, one_sentence: "-", missing: [], source_line: 6, source_snippet: "EXT. DOCKS - NIGHT" },
      beats: [],
      scenes: [],
      setups: [],
    }),
  });
  const gateway = new ModelGateway({ extract: ["fake:router"], judge: ["fake:router"] }, () => model);
  const id = await createRun(db, { sourceName: "script.fountain", text, ...extraSheets });
  expect(await runToEnd(db, id, { gateway, judgeSettings })).toEqual({ state: "done" });
  const rows = await db.select().from(runStages).where(eq(runStages.runId, id));
  const report = <T,>(stage: string) => JSON.parse(rows.find((r) => r.stage === stage)!.reportJson!) as T;
  return { breakdown: report<BreakdownReport>("breakdown"), locations: report<LocationsReport>("locations") };
}

describe("stated ages", () => {
  it("reads exact ages as minors and decades as adults", () => {
    const scene = parseFountain(script).scenes.find((s) => s.number === "7")!;
    const ages = statedAges(scene);
    expect(ages.map((a) => [a.name, a.age, isMinor(a)])).toEqual([
      ["YOUNG MAYA", 8, true],
      ["YOUNG DANIEL", 12, true],
      ["FATHER", 40, false],
    ]);
    expect(ages[0]).toMatchObject({ line: 85, snippet: "YOUNG MAYA (8)" });
  });
});

describe("breakdown stage", () => {
  it("breaks down every scene and routes alerts to departments, each with citations", async () => {
    const { breakdown: b } = await runSample();
    expect(b.scenes).toHaveLength(10);
    const s4 = b.scenes.find((s) => s.number === "4")!;
    expect(s4.cast).toEqual(expect.arrayContaining(["MAYA REYES", "DANIEL REYES"]));
    expect(s4.elements.map((e) => e.category).sort()).toEqual(["makeup", "vehicle"]);

    const titles = b.alerts.map((a) => a.title);
    expect(titles).toEqual(expect.arrayContaining(["Child performer", "Stunt or fight", "Fire or flame", "Picture vehicle", "Practical effect", "Night exterior", "Dawn or dusk exterior"]));
    expect(titles).not.toContain("Child performer at night"); // the children appear in a DAY flashback
    expect(b.alerts.find((a) => a.title === "Child performer")).toMatchObject({ severity: "high", scenes: ["7"] });
    expect(b.alerts.find((a) => a.title === "Night exterior")?.scenes).toEqual(["1", "10"]);
    expect(b.alerts.find((a) => a.title === "Dawn or dusk exterior")?.scenes).toEqual(["9"]);
    for (const a of b.alerts) expect(a.cites.length).toBeGreaterThan(0);
    expect(b.alerts[0].severity).toBe("high");
  });

  it("flags a child performer in a night scene", async () => {
    const night = script.replace("INT. LIGHTHOUSE - DAY (FLASHBACK)", "INT. LIGHTHOUSE - NIGHT (FLASHBACK)");
    const { breakdown: b } = await runSample(night);
    expect(b.alerts.find((a) => a.title === "Child performer at night")).toMatchObject({ severity: "high", scenes: ["7"] });
  });
});

describe("locations stage", () => {
  it("groups scenes into sets and checks them against the sheet", async () => {
    const { locations: l } = await runSample();
    expect(l.sheetGiven).toBe(true);
    const lighthouse = l.sets.find((s) => s.name === "LIGHTHOUSE")!;
    expect(lighthouse.scenes).toEqual(["7", "9", "10"]);
    expect(lighthouse.onSheet).toBe(true);
    expect(l.sets.every((s) => s.onSheet)).toBe(true);
    expect(l.flags.map((f) => f.title)).toContain("LIGHTHOUSE is needed by day and by night");
    expect(l.flags.some((f) => /not on the location sheet/.test(f.title))).toBe(false);
  });

  it("flags a set missing from the sheet", async () => {
    const extra = script.replace("INT. POLICE STATION - DAY", "INT. CITY MORGUE - DAY");
    const { locations: l } = await runSample(extra);
    expect(l.flags.find((f) => f.title === "CITY MORGUE is not on the location sheet")).toMatchObject({ severity: "medium" });
  });

  it("says nothing about sheet coverage when no sheet was given", async () => {
    const { locations: l } = await runSample(script, {});
    expect(l.sheetGiven).toBe(false);
    expect(l.sets.every((s) => s.onSheet === null)).toBe(true);
  });
});
