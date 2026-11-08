"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { getDb } from "@/lib/db/client";
import { dismissals, findings } from "@/lib/db/schema";

function findingById(id: number) {
  const f = getDb().select().from(findings).where(eq(findings.id, id)).get();
  if (!f) throw new Error(`finding ${id} not found`);
  return f;
}

/** Mark a finding as intentional. Remembered by signature, so it stays dismissed after re-runs. */
export async function dismissFinding(formData: FormData) {
  const f = findingById(Number(formData.get("id")));
  const reason = String(formData.get("reason") ?? "").trim() || null;
  const db = getDb();
  db.insert(dismissals)
    .values({ findingSignature: f.signature, reason })
    .onConflictDoUpdate({ target: dismissals.findingSignature, set: { reason } })
    .run();
  db.update(findings).set({ status: "dismissed_intentional" }).where(eq(findings.signature, f.signature)).run();
  refresh();
}

export async function flagFinding(formData: FormData) {
  const f = findingById(Number(formData.get("id")));
  getDb().update(findings).set({ status: "follow_up" }).where(eq(findings.signature, f.signature)).run();
  refresh();
}

export async function reopenFinding(formData: FormData) {
  const f = findingById(Number(formData.get("id")));
  const db = getDb();
  db.delete(dismissals).where(eq(dismissals.findingSignature, f.signature)).run();
  db.update(findings).set({ status: "open" }).where(eq(findings.signature, f.signature)).run();
  refresh();
}
