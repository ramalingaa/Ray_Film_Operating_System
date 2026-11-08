import "./env";
import { describeTarget, openDb } from "@/lib/db/client";

async function main() {
  await openDb(undefined, { migrate: true });
  console.log("database migrated:", describeTarget());
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
