import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema>;

const MIGRATIONS = path.join(process.cwd(), "src/lib/db/migrations");

/** Open (and migrate) a database. Use ":memory:" in tests. */
export function openDb(file = process.env.DATABASE_PATH ?? "data/reelgraph.db"): Db {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS });
  return db;
}

let shared: Db | undefined;
/** Process-wide connection for the Next.js server and scripts. */
export function getDb(): Db {
  shared ??= openDb();
  return shared;
}
