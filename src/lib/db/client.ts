/**
 * Database connection. Postgres everywhere:
 * - DATABASE_URL set → that server (Supabase in production, via its pooler).
 * - otherwise        → PGlite (Postgres compiled to WASM, in-process), on
 *                      disk at DATABASE_PATH, or in memory for ":memory:".
 * Same schema, same SQL dialect, same migrations in every case.
 */
import { migrate as migratePg } from "drizzle-orm/postgres-js/migrator";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const MIGRATIONS = path.join(process.cwd(), "src/lib/db/migrations");

export interface OpenOptions {
  /** Apply pending migrations after connecting. */
  migrate?: boolean;
}

/** Where `openDb()` connects by default, for messages (never includes credentials). */
export function describeTarget(target = defaultTarget()): string {
  if (target === ":memory:") return "in-memory PGlite";
  if (/^postgres(ql)?:\/\//.test(target)) {
    const u = new URL(target);
    return `Postgres at ${u.hostname}:${u.port || 5432}${u.pathname}`;
  }
  return `PGlite at ${target}`;
}

function defaultTarget(): string {
  return process.env.DATABASE_URL || process.env.DATABASE_PATH || "data/pglite";
}

/**
 * Open a database. Pass a postgres:// URL, a PGlite directory, or ":memory:".
 * PGlite databases are always migrated (they are local and single-process).
 */
export async function openDb(target = defaultTarget(), opts: OpenOptions = {}): Promise<Db> {
  if (/^postgres(ql)?:\/\//.test(target)) {
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    // prepare:false is required behind Supabase's transaction pooler (port 6543).
    const client = postgres(target, { prepare: false, max: Number(process.env.DATABASE_POOL_MAX ?? 5), onnotice: () => {} });
    const db = drizzle(client, { schema });
    if (opts.migrate) await migratePg(db, { migrationsFolder: MIGRATIONS });
    return db as unknown as Db;
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  if (target !== ":memory:") fs.mkdirSync(target, { recursive: true });
  const client = target === ":memory:" ? new PGlite() : new PGlite(target);
  const db = drizzle(client, { schema });
  await migratePglite(db, { migrationsFolder: MIGRATIONS });
  return db as unknown as Db;
}

let shared: Promise<Db> | undefined;
/**
 * Process-wide connection for the Next.js server and scripts. The server does
 * not migrate a remote database; run `npm run db:migrate` once per schema change.
 */
export function getDb(): Promise<Db> {
  shared ??= openDb().catch((err) => {
    shared = undefined; // let the next request retry
    throw err;
  });
  return shared;
}
