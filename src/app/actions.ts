"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { Ledger } from "@/lib/agents/runtime";
import { judgeSettingsFromEnv } from "@/lib/checks/judge";
import { getDb } from "@/lib/db/client";
import { dismissals, findings } from "@/lib/db/schema";
import { applySceneEdit, applyScriptEdit } from "@/lib/impact/apply";
import { availableGateway } from "@/lib/llm/available";

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

// ---- change impact ------------------------------------------------------------

function impactContext() {
  const db = getDb();
  return { ctx: { db, ledger: new Ledger(db), gateway: availableGateway(["extract", "judge"]).gateway }, judgeSettings: judgeSettingsFromEnv() };
}

/** Upload an edited .fountain file as the next version of the script, then show its impact. */
export async function uploadEditedScript(formData: FormData) {
  const baseId = Number(formData.get("baseId"));
  const file = formData.get("script");
  if (!(file instanceof File) || file.size === 0) throw new Error("choose a .fountain file to upload");
  const { ctx, judgeSettings } = impactContext();
  const r = await applyScriptEdit(ctx, baseId, await file.text(), judgeSettings);
  redirect(`/impact?from=${r.from.id}&to=${r.to.id}`);
}

/** Replace one scene's text, save it as the next version, then show its impact. */
export async function editSceneText(formData: FormData) {
  const baseId = Number(formData.get("baseId"));
  const scene = String(formData.get("scene") ?? "");
  const text = String(formData.get("text") ?? "");
  if (!scene || !text.trim()) throw new Error("pick a scene and enter its new text");
  const { ctx, judgeSettings } = impactContext();
  const r = await applySceneEdit(ctx, baseId, scene, text, judgeSettings);
  redirect(`/impact?from=${r.from.id}&to=${r.to.id}`);
}
