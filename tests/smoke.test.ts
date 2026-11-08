import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { openDb } from "@/lib/db/client";

describe("smoke", () => {
  it("opens a migrated in-memory Postgres (PGlite) database", async () => {
    const db = await openDb(":memory:");
    const tables = (await db.execute(sql`select table_name as name from information_schema.tables where table_schema = 'public'`)) as unknown as
      | { rows: { name: string }[] }
      | { name: string }[];
    const names = (Array.isArray(tables) ? tables : tables.rows).map((t) => t.name);
    for (const t of ["documents", "scenes", "entities", "facts", "findings", "dismissals", "agent_runs", "pipeline_issues"]) {
      expect(names).toContain(t);
    }
  });
});
