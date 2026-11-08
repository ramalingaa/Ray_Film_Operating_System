import { describe, expect, it } from "vitest";
import { costumeSheetMismatch } from "@/lib/checks/costume-sheet-mismatch";
import { impossibleCostumeChange } from "@/lib/checks/impossible-costume-change";
import { propLifecycle } from "@/lib/checks/prop-lifecycle";
import { timelineOrder } from "@/lib/checks/timeline-order";
import { BibleBuilder } from "./helpers/bible";

describe("costume_sheet_mismatch", () => {
  it("flags a swapped garment, citing both sources", () => {
    const b = new BibleBuilder().scene("1").scene("2");
    const w = b.wears("2", "DANIEL", "black tuxedo");
    const s = b.sheet("DANIEL", "navy suit, white shirt", { scenes: ["1", "2"] });
    const out = costumeSheetMismatch.run(b.build());
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ severity: "high", factIds: [w, s], sceneNumbers: ["2"] });
    expect(out[0].explanation).toContain("costumes.csv line");
  });

  it("flags a colour change of the same garment as medium", () => {
    const b = new BibleBuilder().scene("1");
    b.wears("1", "MAYA", "red dress");
    b.sheet("MAYA", "blue dress", { scenes: ["1"] });
    expect(costumeSheetMismatch.run(b.build())[0].severity).toBe("medium");
  });

  it("falls back to the story day when the row has no scene range", () => {
    const b = new BibleBuilder().scene("1", { day: 3 });
    b.wears("1", "MAYA", "red dress");
    b.sheet("MAYA", "blue dress", { day: 3 });
    b.sheet("MAYA", "red dress", { day: 4 });
    expect(costumeSheetMismatch.run(b.build())).toHaveLength(1);
  });

  it("stays quiet for matches, partial descriptions, other characters and unlisted pieces", () => {
    const b = new BibleBuilder().scene("1").scene("2");
    b.wears("1", "MAYA", "green raincoat");
    b.wears("1", "MAYA", "red scarf"); // sheet is silent on accessories
    b.wears("2", "MAYA", "raincoat");
    b.wears("2", "DANIEL", "tuxedo"); // no sheet row for Daniel
    b.sheet("MAYA", "green raincoat, grey sweater, jeans", { scenes: ["1", "2"] });
    expect(costumeSheetMismatch.run(b.build())).toEqual([]);
  });
});

describe("impossible_costume_change", () => {
  it("flags a different garment in a CONTINUOUS scene", () => {
    const b = new BibleBuilder().scene("1", { time: "NIGHT" }).scene("2", { time: "CONTINUOUS" });
    b.wears("1", "MAYA", "green raincoat");
    b.wears("2", "MAYA", "black leather jacket");
    const out = impossibleCostumeChange.run(b.build());
    expect(out).toHaveLength(1);
    expect(out[0].sceneNumbers).toEqual(["1", "2"]);
  });

  it("allows changes when time passes, when shown on screen, or across a flashback", () => {
    const later = new BibleBuilder().scene("1", { time: "NIGHT" }).scene("2", { time: "MORNING" });
    later.wears("1", "MAYA", "green raincoat");
    later.wears("2", "MAYA", "black leather jacket");
    expect(impossibleCostumeChange.run(later.build())).toEqual([]);

    const onScreen = new BibleBuilder().scene("1").scene("2", { time: "CONTINUOUS" });
    onScreen.wears("1", "DANIEL", "navy suit");
    onScreen.wears("1", "DANIEL", "grey hoodie", { changesInto: true });
    onScreen.wears("2", "DANIEL", "grey hoodie");
    expect(impossibleCostumeChange.run(onScreen.build())).toEqual([]);

    const fb = new BibleBuilder().scene("1").scene("2", { time: "CONTINUOUS", flashback: true });
    fb.wears("1", "MAYA", "green raincoat");
    fb.wears("2", "MAYA", "school uniform");
    expect(impossibleCostumeChange.run(fb.build())).toEqual([]);
  });

  it("ignores compatible re-descriptions and other slots", () => {
    const b = new BibleBuilder().scene("1").scene("2", { time: "MOMENTS LATER" });
    b.wears("1", "DANIEL", "navy suit");
    b.wears("2", "DANIEL", "torn suit jacket");
    b.wears("2", "DANIEL", "white shirt");
    expect(impossibleCostumeChange.run(b.build())).toEqual([]);
  });
});

describe("timeline_order", () => {
  it("flags an explicit day that runs backwards", () => {
    const b = new BibleBuilder()
      .scene("1", { day: 1, basis: "explicit" })
      .scene("2", { day: 3, basis: "explicit" })
      .scene("3", { day: 2, basis: "explicit" });
    const out = timelineOrder.run(b.build());
    expect(out).toHaveLength(1);
    expect(out[0].sceneNumbers).toEqual(["2", "3"]);
  });

  it("allows flashbacks, same days and forward jumps", () => {
    const b = new BibleBuilder()
      .scene("1", { day: 2, basis: "explicit" })
      .scene("2", { day: null, flashback: true })
      .scene("3", { day: 1, basis: "explicit", flashback: true })
      .scene("4", { day: 2, basis: "continuity" })
      .scene("5", { day: 5, basis: "explicit" });
    expect(timelineOrder.run(b.build())).toEqual([]);
  });
});

describe("prop_lifecycle", () => {
  it("flags use after destruction", () => {
    const b = new BibleBuilder().scene("1").scene("2").scene("3");
    b.prop("1", "LEDGER", "introduced");
    b.prop("2", "LEDGER", "destroyed");
    b.prop("3", "LEDGER", "used");
    const out = propLifecycle.run(b.build());
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ severity: "high", sceneNumbers: ["2", "3"] });
  });

  it("flags use before introduction", () => {
    const b = new BibleBuilder().scene("1").scene("2");
    b.prop("1", "BRASS KEY", "used");
    b.prop("2", "BRASS KEY", "introduced");
    expect(propLifecycle.run(b.build())[0].title).toContain("before it is introduced");
  });

  it("flags a fixed prop in two locations on one day", () => {
    const b = new BibleBuilder().scene("1", { location: "PARLOR" }).scene("2", { location: "BARN" });
    b.prop("1", "PIANO", "used", { fixedInPlace: true });
    b.prop("2", "PIANO", "mentioned", { fixedInPlace: true });
    expect(propLifecycle.run(b.build())[0].title).toContain("two places");
  });

  it("stays quiet for repairs, mentions, flashbacks and portable props", () => {
    const b = new BibleBuilder()
      .scene("1", { location: "HOUSE" })
      .scene("2", { location: "HOUSE" })
      .scene("3", { flashback: true, location: "HOUSE" })
      .scene("4", { location: "HOUSE" })
      .scene("5", { location: "CAR" })
      .scene("6", { location: "CAR" });
    b.prop("1", "LEDGER", "introduced");
    b.prop("2", "LEDGER", "destroyed");
    b.prop("3", "LEDGER", "used"); // a flashback shows its past
    b.prop("4", "LEDGER", "mentioned");
    b.prop("1", "KEY", "used");
    b.prop("5", "KEY", "used"); // portable: it can travel
    b.prop("5", "VASE", "destroyed");
    b.prop("6", "VASE", "replaced");
    b.prop("6", "VASE", "used");
    expect(propLifecycle.run(b.build())).toEqual([]);
  });
});
