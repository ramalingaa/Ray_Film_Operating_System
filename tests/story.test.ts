import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { buildStoryReport, numberedScript, type StoryAnalysis } from "@/lib/stages/story";
import { beatTiming, outOfOrder } from "@/lib/story/beats";

const script = fs.readFileSync("data/script.fountain", "utf8");

describe("beat timing", () => {
  it("marks beats early, late, on time or missing against generous ranges", () => {
    expect(beatTiming("catalyst", 0.1)).toBe("on_time");
    expect(beatTiming("catalyst", 0.5)).toBe("late");
    expect(beatTiming("finale", 0.5)).toBe("early");
    expect(beatTiming("midpoint", null)).toBe("missing");
  });
  it("finds point beats in the wrong order", () => {
    expect(outOfOrder({ catalyst: 0.1, midpoint: 0.5, all_is_lost: 0.4 })).toEqual([["midpoint", "all_is_lost"]]);
    expect(outOfOrder({ catalyst: 0.1, midpoint: 0.5 })).toEqual([]);
  });
});

const card = (n: string, line: number, snippet: string, turns = true) => ({
  scene_number: n,
  purpose: `purpose ${n}`,
  conflict: null,
  start_value: "before",
  end_value: turns ? "after" : "before",
  turns,
  source_line: line,
  source_snippet: snippet,
});

/** A plausible analysis of data/script.fountain with one bad citation planted. */
const analysis: StoryAnalysis = {
  logline: {
    protagonist: "Maya Reyes",
    goal: "find her father's ledger",
    stakes: null,
    obstacle: "Voss",
    one_sentence: "Maya must recover her father's ledger before the harbormaster who ruined him destroys it.",
    missing: ["stakes"],
    source_line: 65,
    source_snippet: "The ledger's in the old lighthouse.",
  },
  beats: [
    { beat: "opening_image", scene_number: "1", note: "Rain on the pier.", source_line: 8, source_snippet: "Rain hammers the pier." },
    { beat: "catalyst", scene_number: "1", note: "Daniel hands over the key.", source_line: 12, source_snippet: "He presses a small brass key" },
    { beat: "midpoint", scene_number: "5", note: "The ledger's location.", source_line: 65, source_snippet: "The ledger's in the old lighthouse." },
    { beat: "all_is_lost", scene_number: "9", note: "The ledger burns.", source_line: 111, source_snippet: "Her black leather jacket is scorched." },
    { beat: "final_image", scene_number: "10", note: "Maya with the key.", source_line: 117, source_snippet: "the brass key in her fist" },
    // Planted: this line is not in scene 3.
    { beat: "break_into_two", scene_number: "3", note: "Daniel runs.", source_line: 45, source_snippet: "Maya decides to leave town" },
  ],
  scenes: [
    card("1", 12, "He presses a small brass key"),
    card("2", 35, "Where's my father's ledger?"),
    card("3", 45, "Daniel breaks free and bolts."),
    card("4", 56, "Get in!"),
    card("5", 65, "The ledger's in the old lighthouse."),
    card("6", 79, "slips the brass key into her pocket", false),
    card("7", 88, "Nobody looks up."),
    card("8", 95, "The ledger is in the lighthouse."),
    card("9", 104, "pulls out the leather-bound ledger"),
    card("10", 120, "It's gone. All of it."),
  ],
  setups: [
    { description: "The brass key", setup_scene: "1", payoff_scene: "9", source_line: 12, source_snippet: "a small brass key" },
    { description: "Okafor warns Maya not to go alone", setup_scene: "8", payoff_scene: null, source_line: 98, source_snippet: "Then don't go up there alone." },
  ],
};

describe("story report", () => {
  const r = buildStoryReport(analysis, script, "script.fountain", { model: "fake", cacheHit: false });

  it("keeps verified citations and drops the one that is not in the script", () => {
    expect(r.beats.find((b) => b.id === "catalyst")).toMatchObject({ scene: "1", timing: "on_time", cite: { line: 12, docName: "script.fountain" } });
    expect(r.beats.find((b) => b.id === "break_into_two")).toMatchObject({ timing: "missing", cite: undefined });
    expect(r.dropped).toEqual(["Break into Two: the quoted line was not found in scene 3"]);
    expect(r.scenes).toHaveLength(10);
    expect(r.logline.cite).toMatchObject({ line: 65, sceneNumber: "5" });
  });

  it("measures beat positions from the first scene to the end of the script", () => {
    const opening = r.beats.find((b) => b.id === "opening_image")!;
    const final = r.beats.find((b) => b.id === "final_image")!;
    expect(opening.position).toBeLessThan(0.05);
    expect(final.position).toBeGreaterThan(0.9);
  });

  it("raises findings for unclear stakes, missing beats, a scene that does not turn, and an unpaid setup", () => {
    const titles = r.issues.map((i) => i.title);
    expect(titles).toContain("Unclear: stakes");
    expect(titles).toContain("No scene delivers the Break into Two");
    expect(titles).toContain("Scene 6 does not turn");
    expect(titles).toContain("Set up in scene 8, never paid off");
    expect(r.shortForm).toBe(true); // a 10-scene sample is short-form: beat findings are low
    expect(r.issues.find((i) => i.title === "No scene delivers the Break into Two")?.severity).toBe("low");
    expect(r.issues[0].severity).not.toBe("low"); // most severe first
  });

  it("numbers every line of the script for the model", () => {
    const lines = numberedScript(script).split("\n");
    expect(lines[5]).toBe("    6| EXT. DOCKS - NIGHT");
  });
});
