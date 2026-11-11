/**
 * Apply pending database migrations.
 *
 *   npm run db:migrate        # the database in DATABASE_URL (or local PGlite)
 *   tsx scripts/migrate.ts --deploy
 *
 * --deploy is what each Vercel build runs first (the "vercel-build" script),
 * so the database schema always matches the code being deployed. A build
 * without DATABASE_URL skips it (the app then shows its setup message); a
 * failed migration fails the build, so code never goes live against an old
 * schema. Migrations only add tables and columns.
 */
import "./env";
import { databaseProblem, describeTarget, openDb } from "@/lib/db/client";

async function main() {
  const deploy = process.argv.includes("--deploy");
  if (deploy && !process.env.DATABASE_URL?.trim()) {
    console.log("migrate: DATABASE_URL is not set for this build; skipping database migrations.");
    process.exit(0);
  }
  const problem = deploy ? databaseProblem() : undefined;
  if (problem) throw new Error(`migrate: ${problem}`);
  await openDb(undefined, { migrate: true });
  console.log("database migrated:", describeTarget());
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
