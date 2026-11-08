import { describe, expect, it } from "vitest";
import { compareGarments, conflictWith, parseGarment, splitCostume } from "@/lib/checks/garments";

const g = (t: string) => parseGarment(t)!;

describe("garments", () => {
  it("classifies garments by slot and head", () => {
    expect(g("green raincoat")).toMatchObject({ head: "raincoat", slot: "outerwear" });
    expect(g("torn suit jacket")).toMatchObject({ head: "suit", slot: "full_body" });
    expect(g("old grey hoodie")).toMatchObject({ head: "hoodie", slot: "top" });
    expect(parseGarment("a lit lantern")).toBeUndefined();
  });

  it("splits sheet cells into garments", () => {
    expect(splitCostume("navy suit, white shirt and black shoes").map((x) => x.head)).toEqual(["suit", "shirt", "shoes"]);
  });

  it("compares by slot, head and colour family", () => {
    expect(compareGarments(g("navy suit"), g("blue suit"))).toBe("compatible");
    expect(compareGarments(g("red dress"), g("blue dress"))).toBe("different_colour");
    expect(compareGarments(g("tuxedo"), g("grey suit"))).toBe("different_garment");
    expect(compareGarments(g("leather jacket"), g("black leather jacket"))).toBe("compatible");
    expect(compareGarments(g("raincoat"), g("coat"))).toBe("compatible");
    expect(compareGarments(g("jumper"), g("grey sweater"))).toBe("compatible");
    expect(compareGarments(g("jeans"), g("navy suit"))).toBe("unrelated");
    expect(compareGarments(g("red scarf"), g("striped tie"))).toBe("unrelated");
  });

  it("only conflicts when the other side covers the same slot with nothing compatible", () => {
    const sheet = splitCostume("green raincoat, grey sweater, jeans");
    expect(conflictWith(g("green raincoat"), sheet)).toBeUndefined();
    expect(conflictWith(g("red scarf"), sheet)).toBeUndefined();
    expect(conflictWith(g("black leather jacket"), sheet)?.relation).toBe("different_garment");
  });
});
