import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { eq } from "drizzle-orm";
import { isMinor, minorMatcher, statedAges } from "@/lib/breakdown/rules";
import { openDb } from "@/lib/db/client";
import { runStages } from "@/lib/db/schema";
import { parseFountain } from "@/lib/fountain";
import { ModelGateway } from "@/lib/llm/gateway";
import { createRun, runToEnd } from "@/lib/pipeline/runs";
import type { BreakdownReport } from "@/lib/stages/breakdown";
import type { BudgetReport } from "@/lib/stages/budget";
import type { LocationsReport } from "@/lib/stages/locations";
import type { ScheduleReport } from "@/lib/stages/schedule";
import { rateCard } from "@/lib/budget/rates";
import { dayOutOfDays, lightOf, planDays } from "@/lib/schedule/plan";
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
  return {
    breakdown: report<BreakdownReport>("breakdown"),
    locations: report<LocationsReport>("locations"),
    schedule: report<ScheduleReport>("schedule"),
    budget: report<BudgetReport>("budget"),
  };
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

describe("minor matching", () => {
  it("matches a child by name wherever they appear, without matching adults who share a word", () => {
    const isMinor = minorMatcher(["YOUNG MAYA (8)", "KIRAN"]);
    expect(isMinor("YOUNG MAYA")).toBe(true);
    expect(isMinor("Kiran")).toBe(true);
    expect(isMinor("MAYA REYES")).toBe(false);
    expect(isMinor("MAYA")).toBe(true); // "YOUNG MAYA" ends with " MAYA": ambiguous names count as the child, the safe side
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

describe("schedule planning", () => {
  const strip = (scene: string, set: string, light: "day" | "night", eighths: number, cast: string[] = []) => ({ scene, set, intExt: "INT", time: light.toUpperCase(), light, eighths, cast, line: 1, heading: scene });

  it("carries day or night through CONTINUOUS and MOMENTS LATER", () => {
    expect(lightOf(["NIGHT", "CONTINUOUS", "MOMENTS LATER", "MORNING", "CONTINUOUS", "DUSK"])).toEqual(["night", "night", "night", "day", "day", "day"]);
  });

  it("keeps day and night work on separate days, groups by set, and respects the page budget", () => {
    const days = planDays([strip("1", "A", "night", 8), strip("2", "B", "day", 30), strip("3", "A", "day", 20), strip("4", "B", "day", 20), strip("5", "A", "night", 8)], 40);
    expect(days.map((d) => [d.light, d.strips.map((s) => s.scene)])).toEqual([
      ["day", ["2"]],
      ["day", ["4", "3"]],
      ["night", ["1", "5"]],
    ]);
    expect(days.every((d) => d.eighths <= 40 || d.strips.length === 1)).toBe(true);
  });

  it("counts holding days between a performer's first and last work day", () => {
    const days = planDays([strip("1", "A", "day", 40, ["ANA"]), strip("2", "B", "day", 40, ["BO"]), strip("3", "C", "day", 40, ["ANA"])], 40);
    expect(dayOutOfDays(days).find((c) => c.name === "ANA")).toMatchObject({ workDays: [1, 3], holdDays: [2] });
  });
});

describe("schedule and budget stages", () => {
  it("schedules the sample and costs it, with every line traceable", async () => {
    const { schedule: s, budget: b } = await runSample();
    expect(s.totals.shootDays).toBeGreaterThanOrEqual(2);
    const scheduled = s.days.flatMap((d) => d.strips.map((x) => x.scene)).sort((x, y) => Number(x) - Number(y));
    expect(scheduled).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]);
    expect(s.days.find((d) => d.strips.some((x) => x.scene === "2"))?.light).toBe("night"); // CONTINUOUS after a night scene

    expect(b.total).toBe(b.lines.reduce((n, l) => n + l.amount, 0));
    const labels = b.lines.map((l) => l.label);
    expect(labels).toEqual(expect.arrayContaining(["Shooting crew", "Stunt coordinator", "Fire safety officer", "Picture vehicles", "Studio teacher (child performers)", "Night lighting and generator"]));
    const contingency = b.lines.find((l) => l.section === "Contingency")!;
    const subtotal = b.lines.filter((l) => l.section !== "Contingency").reduce((n, l) => n + l.amount, 0);
    expect(contingency.amount).toBe(Math.round(subtotal * 0.1));
    for (const l of b.lines) expect(l.basis.length).toBeGreaterThan(0);
  });

  it("flags child performers on a night shoot day", async () => {
    const night = script.replace("INT. LIGHTHOUSE - DAY (FLASHBACK)", "INT. LIGHTHOUSE - NIGHT (FLASHBACK)");
    const { schedule: s } = await runSample(night);
    expect(s.checks.find((c) => /^Child performers? on night shoot day/.test(c.title))).toMatchObject({ severity: "high" });
  });

  it("uses overridden rates", () => {
    const { rates, overridden } = rateCard(false, { BUDGET_RATES: '{"crewDay": 1, "currency": "INR", "bogus": 5}' });
    expect(rates).toMatchObject({ crewDay: 1, currency: "INR" });
    expect(overridden).toEqual(["crewDay", "currency"]);
    expect(() => rateCard(false, { BUDGET_RATES: "{nope" })).toThrow(/not valid JSON/);
  });
});
