import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { eq } from "drizzle-orm";
import { Ledger } from "@/lib/agents/runtime";
import { runChecks } from "@/lib/checks/run";
import { openDb } from "@/lib/db/client";
import { dismissals, findings } from "@/lib/db/schema";
import { ingest } from "@/lib/pipeline/ingest";
import { latestScript, loadHealth, loadReadiness, loadReview } from "@/lib/ui/queries";

async function seededDb() {
  const db = await openDb(":memory:");
  const r = await ingest(
    { db, ledger: new Ledger(db) },
    {
      script: { name: "script.seeded.fountain", text: fs.readFileSync("data/eval/script.seeded.fountain", "utf8") },
      costumes: { name: "costumes.csv", text: fs.readFileSync("data/costumes.csv", "utf8") },
      locations: { name: "locations.csv", text: fs.readFileSync("data/locations.csv", "utf8") },
    },
  );
  await runChecks(db, r.scriptDocId);
  return { db, docId: r.scriptDocId };
}

describe("UI queries", () => {
  it("loads scenes and findings with resolved source lines, most severe first", async () => {
    const { db, docId } = await seededDb();
    expect((await latestScript(db))?.id).toBe(docId);
    const review = (await loadReview(db, docId))!;
    expect(review.scenes).toHaveLength(10);
    expect(review.scenes[0].lines[0]).toBe("EXT. DOCKS - NIGHT");
    expect(review.findings.map((f) => f.severity)).toEqual(["high", "high", "medium"]);
    const timeline = review.findings[0];
    expect(timeline.sources.map((s) => [s.isScript, s.line, s.text])).toEqual([
      [true, 64, "SUPER: DAY 3"],
      [true, 79, "SUPER: DAY 2"],
    ]);
    expect(timeline.checkTitle).toBe("Story days go backwards");
  });

  it("reports readiness by severity and check, and shows dismissal reasons", async () => {
    const { db, docId } = await seededDb();
    const f = (await db.select().from(findings).where(eq(findings.checkId, "location_consistency")))[0]!;
    await db.insert(dismissals).values({ findingSignature: f.signature, reason: "renamed on purpose" });
    await runChecks(db, docId);

    const r = (await loadReadiness(db, docId))!;
    expect(r.bySeverity.high).toEqual({ open: 2, followUp: 0, dismissed: 0 });
    expect(r.bySeverity.medium).toEqual({ open: 0, followUp: 0, dismissed: 1 });
    expect(r.byCheck.map((c) => c.checkId)).toEqual(["timeline_order", "location_consistency"]);
    expect((await loadReview(db, docId))!.findings.find((x) => x.checkId === "location_consistency")?.dismissReason).toBe("renamed on purpose");
  });

  it("surfaces pipeline issues", async () => {
    const { db } = await seededDb();
    expect((await loadHealth(db)).issues.some((i) => i.message.includes("no model configured"))).toBe(true);
  });
});
