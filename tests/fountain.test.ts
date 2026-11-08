import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { normalizeCue, parseFountain, splitHeading } from "@/lib/fountain";

describe("normalizeCue", () => {
  it("strips extensions, forced markers and dual-dialogue carets", () => {
    expect(normalizeCue("JOHN (V.O.)")).toEqual({ name: "JOHN", extension: "V.O." });
    expect(normalizeCue("JOHN (O.S.) (CONT'D)")).toEqual({ name: "JOHN", extension: "O.S. CONT'D" });
    expect(normalizeCue("@McCoy")).toEqual({ name: "MCCOY" });
    expect(normalizeCue("BRICK ^")).toEqual({ name: "BRICK" });
  });
});

describe("splitHeading", () => {
  it("separates location and time of day", () => {
    expect(splitHeading("KITCHEN - NIGHT")).toEqual({ location: "KITCHEN", timeOfDay: "NIGHT" });
    expect(splitHeading("JOHN'S HOUSE - KITCHEN - CONTINUOUS")).toEqual({
      location: "JOHN'S HOUSE - KITCHEN",
      timeOfDay: "CONTINUOUS",
    });
    expect(splitHeading("ROOFTOP")).toEqual({ location: "ROOFTOP", timeOfDay: "UNKNOWN" });
    expect(splitHeading("CABIN - DAY 3")).toEqual({ location: "CABIN", timeOfDay: "DAY", day: 3 });
    expect(splitHeading("ATTIC - NIGHT (FLASHBACK)")).toEqual({ location: "ATTIC", timeOfDay: "NIGHT" });
  });
});

const SAMPLE = [
  "Title: Test",
  "Author: Someone",
  "",
  "INT./EXT. CAR - MOVING - NIGHT #1#",
  "",
  "Rain on the windshield.",
  "",
  "JOHN (V.O.)",
  "(quietly)",
  "I knew it would end here.",
  "",
  "EXT. ROAD - CONTINUOUS",
  "",
  "SUPER: DAY TWO",
  "",
  "[[a note that should vanish]]",
  "MARY",
  "Stop the car.",
  "",
  "CUT TO:",
  "",
  ".FLASHBACK - THE BARN",
  "",
  "/* boneyard",
  "INT. HIDDEN - DAY",
  "*/",
  "A barn.",
].join("\n");

describe("parseFountain", () => {
  const parsed = parseFountain(SAMPLE);

  it("reads the title page", () => {
    expect(parsed.titlePage).toEqual({ title: "Test", author: "Someone" });
  });

  it("finds headings with int/ext, location, time and line numbers", () => {
    expect(parsed.scenes.map((s) => [s.number, s.intExt, s.location, s.timeOfDay, s.startLine])).toEqual([
      ["1", "INT/EXT", "CAR - MOVING", "NIGHT", 4],
      ["2", "EXT", "ROAD", "CONTINUOUS", 12],
      ["3", "UNKNOWN", "FLASHBACK - THE BARN", "UNKNOWN", 22],
    ]);
  });

  it("parses character cues, parentheticals and dialogue with speaker names", () => {
    const els = parsed.scenes[0].elements.map((e) => [e.type, e.line, e.character]);
    expect(els).toEqual([
      ["scene_heading", 4, undefined],
      ["action", 6, undefined],
      ["character", 8, "JOHN"],
      ["parenthetical", 9, "JOHN"],
      ["dialogue", 10, "JOHN"],
    ]);
    expect(parsed.scenes[0].elements[2].extension).toBe("V.O.");
    expect(parsed.scenes[1].speakers).toEqual(["MARY"]);
  });

  it("detects explicit story days, transitions and flashbacks", () => {
    expect(parsed.scenes[1].explicitDay).toEqual({ day: 2, line: 14, snippet: "SUPER: DAY TWO" });
    expect(parsed.scenes[1].elements.some((e) => e.type === "transition" && e.text === "CUT TO:")).toBe(true);
    expect(parsed.scenes[2].isFlashback).toBe(true);
  });

  it("drops boneyard content but keeps line numbering", () => {
    expect(parsed.scenes).toHaveLength(3);
    expect(parsed.scenes[2].elements.at(-1)).toMatchObject({ type: "action", text: "A barn.", line: 27 });
  });

  it("handles CRLF input identically", () => {
    expect(parseFountain(SAMPLE.replace(/\n/g, "\r\n")).scenes.map((s) => s.startLine)).toEqual([4, 12, 22]);
  });
});

describe("placeholder script", () => {
  const script = parseFountain(fs.readFileSync("data/script.fountain", "utf8"));

  it("has the 10 scenes counted by hand", () => {
    expect(script.scenes.map((s) => s.heading)).toEqual([
      "EXT. DOCKS - NIGHT",
      "INT. HARBOR OFFICE - CONTINUOUS",
      "INT. HARBOR OFFICE - MOMENTS LATER",
      "EXT. HARBOR ROAD - CONTINUOUS",
      "INT. MAYA'S APARTMENT - NIGHT",
      "INT. MAYA'S APARTMENT - MORNING",
      "INT. LIGHTHOUSE - DAY (FLASHBACK)",
      "INT. POLICE STATION - DAY",
      "EXT. LIGHTHOUSE - DUSK",
      "EXT. LIGHTHOUSE - NIGHT",
    ]);
  });

  it("flags the flashback and the explicit day 2", () => {
    expect(script.scenes.filter((s) => s.isFlashback).map((s) => s.ordinal)).toEqual([7]);
    expect(script.scenes[5].explicitDay?.day).toBe(2);
    expect(script.scenes[6].location).toBe("LIGHTHOUSE");
  });

  it("collects speakers per scene, folding V.O./O.S. into the name", () => {
    expect(script.scenes[8].speakers).toEqual(["VOSS"]);
    expect(script.scenes[0].speakers).toEqual(["DANIEL", "MAYA"]);
  });
});
