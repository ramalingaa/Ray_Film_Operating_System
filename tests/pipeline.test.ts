import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { eq } from "drizzle-orm";
import { Ledger } from "@/lib/agents/runtime";
import { runChecks } from "@/lib/checks/run";
import { openDb } from "@/lib/db/client";
import { dismissals, findings } from "@/lib/db/schema";
import { ModelGateway } from "@/lib/llm/gateway";
import type { SceneExtraction } from "@/lib/extract/schema";
import { ingest } from "@/lib/pipeline/ingest";
import { emptyExtraction, fakeExtractModel } from "./helpers/fake-model";

const clean = fs.readFileSync("data/script.fountain", "utf8");
const sheets = {
  costumes: { name: "costumes.csv", text: fs.readFileSync("data/costumes.csv", "utf8") },
  locations: { name: "locations.csv", text: fs.readFileSync("data/locations.csv", "utf8") },
};

type Costume = [who: string, garment: string, state?: SceneExtraction["costumes"][number]["state"]];
type Prop = [name: string, action: SceneExtraction["props"][number]["action"]];

/** What a careful extractor would read from the placeholder script, scene by scene. */
const CLEAN: Record<string, { costumes?: Costume[]; props?: Prop[] }> = {
  "1": { costumes: [["MAYA REYES", "green raincoat"], ["MAYA REYES", "grey sweater"], ["DANIEL REYES", "navy suit"], ["DANIEL REYES", "white shirt"]], props: [["brass key", "introduced"]] },
  "2": { costumes: [["VOSS", "brown cardigan"], ["DANIEL", "navy suit", "wet"]], props: [["ledger", "mentioned"]] },
  "3": { costumes: [["DANIEL", "suit jacket", "torn"]] },
  "4": { costumes: [["DANIEL", "torn suit jacket", "torn"], ["MAYA", "green raincoat"]] },
  "5": { costumes: [["DANIEL", "torn suit jacket", "torn"]], props: [["ledger", "mentioned"]] },
  "6": { costumes: [["DANIEL", "grey hoodies"], ["MAYA", "black leather jacket"], ["MAYA", "jeans"]], props: [["brass key", "used"]] },
  "7": { props: [["leather-bound ledger", "introduced"]] },
  "8": { costumes: [["OKAFOR", "charcoal overcoat"], ["MAYA", "black leather jacket"]], props: [["ledger", "mentioned"]] },
  "9": { costumes: [["VOSS", "oilskin coat"], ["MAYA", "black leather jacket", "scorched"]], props: [["brass key", "used"], ["leather-bound ledger", "used"], ["lantern", "destroyed"], ["leather-bound ledger", "destroyed"]] },
  "10": { costumes: [["OKAFOR", "charcoal overcoat"], ["MAYA", "scorched leather jacket", "scorched"]], props: [["brass key", "used"]] },
};

/** Snippets are taken from the heading line; verification moves them to the right line or drops them. */
function extractor(plan: typeof CLEAN, text: string) {
  const lines = text.split("\n");
  const lineOf = (needle: string, from: number) => {
    const idx = lines.findIndex((l, i) => i + 1 >= from && l.toLowerCase().includes(needle.toLowerCase()));
    return idx + 1;
  };
  return fakeExtractModel((n, first, heading) => {
    const x = emptyExtraction(first, heading);
    const p = plan[n] ?? {};
    x.costumes = (p.costumes ?? []).map(([who, garment, state]) => {
      const word = garment.split(" ").at(-1)!.replace(/s$/, "");
      const line = lineOf(word, first);
      return { character: who, garment, state: state ?? "normal", state_detail: null, changes_into: false, source_line: line, source_snippet: word };
    });
    x.props = (p.props ?? []).map(([name, action]) => {
      const word = name.split(" ").at(-1)!;
      const line = lineOf(word, first);
      return { name, action, holder: null, state: null, fixed_in_place: false, source_line: line, source_snippet: word };
    });
    return x;
  });
}

describe("ingest + deterministic checks on the placeholder script", () => {
  it("finds nothing in the clean script", async () => {
    const db = openDb(":memory:");
    const fake = extractor(CLEAN, clean);
    const ctx = { db, ledger: new Ledger(db), gateway: new ModelGateway({ extract: ["fake:x"], judge: [] }, () => fake) };
    const r = await ingest(ctx, { script: { name: "script.fountain", text: clean }, ...sheets });
    expect(r.droppedItems).toBe(0);
    const summary = runChecks(db, r.scriptDocId);
    const rows = db.select().from(findings).all();
    expect(rows.map((f) => f.title)).toEqual([]);
    expect(summary.failedChecks).toEqual([]);
  });

  it("flags a planted costume error, re-extracts only the edited scene, and remembers dismissals", async () => {
    const db = openDb(":memory:");
    const fake = extractor(CLEAN, clean);
    const ctx = { db, ledger: new Ledger(db), gateway: new ModelGateway({ extract: ["fake:x"], judge: [] }, () => fake) };
    await ingest(ctx, { script: { name: "script.fountain", text: clean }, ...sheets });

    const seededText = clean.replace("Maya, still in her green raincoat, floors it.", "Maya, still in her yellow raincoat, floors it.");
    expect(seededText).not.toBe(clean);
    const seededPlan = { ...CLEAN, "4": { costumes: [["DANIEL", "torn suit jacket", "torn"], ["MAYA", "yellow raincoat"]] as Costume[] } };
    const seeded = extractor(seededPlan, seededText);
    const ctx2 = { ...ctx, gateway: new ModelGateway({ extract: ["fake:x"], judge: [] }, () => seeded) };
    const r = await ingest(ctx2, { script: { name: "script.fountain", text: seededText }, ...sheets });
    expect(r.scriptVersion).toBe(2);
    expect(seeded.calls).toBe(1); // only scene 4 changed

    runChecks(db, r.scriptDocId);
    const found = db.select().from(findings).where(eq(findings.docId, r.scriptDocId)).all();
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ checkId: "costume_sheet_mismatch", severity: "medium", status: "open" });
    expect(found[0].explanation).toContain("costumes.csv line 2");

    db.insert(dismissals).values({ findingSignature: found[0].signature, reason: "Maya borrows a coat off-screen" }).run();
    const again = runChecks(db, r.scriptDocId);
    expect(again).toMatchObject({ total: 1, open: 0, dismissed: 1 });
  });
});
