import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { eq } from "drizzle-orm";
import { Ledger } from "@/lib/agents/runtime";
import { runChecks } from "@/lib/checks/run";
import { openDb } from "@/lib/db/client";
import { dismissals, findings } from "@/lib/db/schema";
import { ModelGateway } from "@/lib/llm/gateway";
import { ingest } from "@/lib/pipeline/ingest";
import { CLEAN_PLAN, planExtractor, type ScenePlan } from "./helpers/placeholder-plan";

const clean = fs.readFileSync("data/script.fountain", "utf8");
const sheets = {
  costumes: { name: "costumes.csv", text: fs.readFileSync("data/costumes.csv", "utf8") },
  locations: { name: "locations.csv", text: fs.readFileSync("data/locations.csv", "utf8") },
};

describe("ingest + deterministic checks on the placeholder script", () => {
  it("finds nothing in the clean script", async () => {
    const db = openDb(":memory:");
    const fake = planExtractor(CLEAN_PLAN, clean);
    const ctx = { db, ledger: new Ledger(db), gateway: new ModelGateway({ extract: ["fake:x"], judge: [] }, () => fake) };
    const r = await ingest(ctx, { script: { name: "script.fountain", text: clean }, ...sheets });
    expect(r.droppedItems).toBe(0);
    const summary = await runChecks(db, r.scriptDocId);
    const rows = db.select().from(findings).all();
    expect(rows.map((f) => f.title)).toEqual([]);
    expect(summary.failedChecks).toEqual([]);
  });

  it("flags a planted costume error, re-extracts only the edited scene, and remembers dismissals", async () => {
    const db = openDb(":memory:");
    const fake = planExtractor(CLEAN_PLAN, clean);
    const ctx = { db, ledger: new Ledger(db), gateway: new ModelGateway({ extract: ["fake:x"], judge: [] }, () => fake) };
    await ingest(ctx, { script: { name: "script.fountain", text: clean }, ...sheets });

    const seededText = clean.replace("Maya, still in her green raincoat, floors it.", "Maya, still in her yellow raincoat, floors it.");
    expect(seededText).not.toBe(clean);
    const seededPlan: ScenePlan = { ...CLEAN_PLAN, "4": { costumes: [["DANIEL", "torn suit jacket", "torn"], ["MAYA", "yellow raincoat"]] } };
    const seeded = planExtractor(seededPlan, seededText);
    const ctx2 = { ...ctx, gateway: new ModelGateway({ extract: ["fake:x"], judge: [] }, () => seeded) };
    const r = await ingest(ctx2, { script: { name: "script.fountain", text: seededText }, ...sheets });
    expect(r.scriptVersion).toBe(2);
    expect(seeded.calls).toBe(1); // only scene 4 changed

    await runChecks(db, r.scriptDocId);
    const found = db.select().from(findings).where(eq(findings.docId, r.scriptDocId)).all();
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ checkId: "costume_sheet_mismatch", severity: "medium", status: "open" });
    expect(found[0].explanation).toContain("costumes.csv line 2");

    db.insert(dismissals).values({ findingSignature: found[0].signature, reason: "Maya borrows a coat off-screen" }).run();
    const again = await runChecks(db, r.scriptDocId);
    expect(again).toMatchObject({ total: 1, open: 0, dismissed: 1 });
  });
});
