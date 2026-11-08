import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { openDb } from "@/lib/db/client";

describe("smoke", () => {
  it("opens a migrated in-memory database", () => {
    const db = openDb(":memory:");
    const tables = db.all<{ name: string }>(sql`select name from sqlite_master where type='table'`);
    const names = tables.map((t) => t.name);
    for (const t of ["documents", "scenes", "entities", "facts", "findings", "dismissals", "agent_runs", "pipeline_issues"]) {
      expect(names).toContain(t);
    }
  });
});
