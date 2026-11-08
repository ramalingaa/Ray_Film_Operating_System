import { openDb } from "@/lib/db/client";

openDb();
console.log("database migrated:", process.env.DATABASE_PATH ?? "data/reelgraph.db");
