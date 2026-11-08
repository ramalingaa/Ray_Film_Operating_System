import { describe, expect, it } from "vitest";
import { resolveCharacters, resolveLocations, resolveProps } from "@/lib/extract/entities";
import { verifySource } from "@/lib/extract/provenance";
import { resolveStoryDays } from "@/lib/extract/story-days";

describe("verifySource", () => {
  const scene = { startLine: 10, text: "INT. ROOM - DAY\n\nMaya opens the “old” door.\nShe smiles\nat Daniel." };
  it("accepts a snippet on its line, ignoring punctuation and smart quotes", () => {
    expect(verifySource(scene, 12, 'opens the "old" door')).toMatchObject({ ok: true, line: 12, corrected: false });
  });
  it("corrects a wrong line number", () => {
    expect(verifySource(scene, 10, "Maya opens")).toMatchObject({ ok: true, line: 12, corrected: true });
  });
  it("accepts snippets that wrap or use an ellipsis", () => {
    expect(verifySource(scene, 13, "She smiles at Daniel")).toMatchObject({ ok: true, line: 13 });
    expect(verifySource(scene, 12, "Maya ... door")).toMatchObject({ ok: true, line: 12 });
  });
  it("rejects snippets that are not in the scene", () => {
    expect(verifySource(scene, 12, "Maya burns the ledger")).toMatchObject({ ok: false });
  });
});

describe("resolveCharacters", () => {
  const r = resolveCharacters(["MAYA", "Maya Reyes", "MAYA (V.O.)", "HARBORMASTER ELI VOSS", "VOSS", "INSPECTOR OKAFOR", "YOUNG MAYA", "DANIEL", "DANIEL REYES", "FATHER"]);
  it("folds cues, titles and unique first/last names into full names", () => {
    expect(r.map.get("MAYA")).toBe("MAYA REYES");
    expect(r.map.get("VOSS")).toBe("ELI VOSS");
    expect(r.map.get("HARBORMASTER ELI VOSS")).toBe("ELI VOSS");
    expect(r.map.get("INSPECTOR OKAFOR")).toBe("OKAFOR");
    expect(r.map.get("DANIEL")).toBe("DANIEL REYES");
  });
  it("keeps differently cast versions apart", () => {
    expect(r.map.get("YOUNG MAYA")).toBe("YOUNG MAYA");
    expect(r.map.get("FATHER")).toBe("FATHER");
  });
  it("records every merge with its rule", () => {
    expect(r.merges).toContainEqual({ alias: "VOSS", canonical: "ELI VOSS", rule: "unique_token_match" });
  });
  it("does not merge an ambiguous single name", () => {
    const amb = resolveCharacters(["SAM", "SAM COLE", "SAM PRICE"]);
    expect(amb.map.get("SAM")).toBe("SAM");
    expect(amb.ambiguous).toEqual([{ name: "SAM", candidates: ["SAM COLE", "SAM PRICE"] }]);
  });
});

describe("resolveProps / resolveLocations", () => {
  it("merges a bare head noun into the one specific prop", () => {
    const r = resolveProps(["the brass key", "key", "Daniel's ledger", "leather-bound ledger", "keys"]);
    expect(r.map.get("KEY")).toBe("BRASS KEY");
    expect(r.map.get("LEDGER")).toBe("LEATHER-BOUND LEDGER");
  });
  it("matches locations by alias and main location", () => {
    const r = resolveLocations(["OLD LIGHTHOUSE", "LIGHTHOUSE - LAMP ROOM", "MOON BASE"], [{ name: "LIGHTHOUSE", aliases: ["OLD LIGHTHOUSE"] }]);
    expect(r.map.get("OLD LIGHTHOUSE")).toBe("LIGHTHOUSE");
    expect(r.map.get("LIGHTHOUSE - LAMP ROOM")).toBe("LIGHTHOUSE");
    expect(r.unmatched).toEqual(["MOON BASE"]);
  });
});

describe("resolveStoryDays", () => {
  it("does day arithmetic in code from parser and model evidence", () => {
    const days = resolveStoryDays([
      { ordinal: 1, isFlashback: false, timeOfDay: "NIGHT" },
      { ordinal: 2, isFlashback: false, timeOfDay: "CONTINUOUS", model: { relation: "unknown", day: null } },
      { ordinal: 3, isFlashback: false, timeOfDay: "MORNING", model: { relation: "next_day", day: null } },
      { ordinal: 4, isFlashback: true, timeOfDay: "DAY" },
      { ordinal: 5, isFlashback: false, timeOfDay: "DAY", parserDay: 5 },
      { ordinal: 6, isFlashback: false, timeOfDay: "NIGHT", model: { relation: "same_day", day: null } },
    ]);
    expect(days.map((d) => [d.day, d.basis])).toEqual([
      [1, "assumed"],
      [1, "continuity"],
      [2, "model_relation"],
      [null, "flashback"],
      [5, "explicit"],
      [5, "model_relation"],
    ]);
  });
});
