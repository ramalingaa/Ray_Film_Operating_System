import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { expandSceneRange, parseCostumeSheet, parseLocationSheet, SheetError } from "@/lib/sheets";

describe("expandSceneRange", () => {
  it("expands ranges and lists", () => {
    expect(expandSceneRange("3-5")).toEqual(["3", "4", "5"]);
    expect(expandSceneRange("3, 7,12a")).toEqual(["3", "7", "12A"]);
    expect(expandSceneRange("")).toEqual([]);
    expect(() => expandSceneRange("5-3")).toThrow(SheetError);
  });
});

describe("costume sheet", () => {
  const rows = parseCostumeSheet(fs.readFileSync("data/costumes.csv", "utf8"));
  it("keeps the CSV line of every row", () => {
    expect(rows[0]).toMatchObject({ line: 2, character: "MAYA REYES", storyDay: 1, costume: "green raincoat, grey sweater, jeans", state: null });
    expect(rows[2]).toMatchObject({ line: 4, scenes: ["4", "5"], state: "torn" });
  });
  it("rejects a sheet missing required columns", () => {
    expect(() => parseCostumeSheet("character,costume\nA,coat\n")).toThrow(/missing column/);
  });
});

describe("location sheet", () => {
  it("splits aliases", () => {
    const rows = parseLocationSheet(fs.readFileSync("data/locations.csv", "utf8"));
    expect(rows[0]).toMatchObject({ line: 2, name: "DOCKS", aliases: ["PIER", "HARBOR DOCKS"], intExt: "EXT" });
    expect(rows).toHaveLength(6);
  });
});
