"use server";

import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { Ledger } from "@/lib/agents/runtime";
import { judgeSettingsFromEnv } from "@/lib/checks/judge";
import { getDb } from "@/lib/db/client";
import { dismissals, findings } from "@/lib/db/schema";
import { applySceneEdit, applyScriptEdit } from "@/lib/impact/apply";
import { availableGateway } from "@/lib/llm/available";
import { runChecks } from "@/lib/checks/run";
import { ingest, type IngestInput } from "@/lib/pipeline/ingest";

async function findingById(id: number) {
  const [f] = await (await getDb()).select().from(findings).where(eq(findings.id, id));
  if (!f) throw new Error(`finding ${id} not found`);
  return f;
}

/** Mark a finding as intentional. Remembered by signature, so it stays dismissed after re-runs. */
export async function dismissFinding(formData: FormData) {
  const f = await findingById(Number(formData.get("id")));
  const reason = String(formData.get("reason") ?? "").trim() || null;
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.insert(dismissals).values({ findingSignature: f.signature, reason }).onConflictDoUpdate({ target: dismissals.findingSignature, set: { reason } });
    await tx.update(findings).set({ status: "dismissed_intentional" }).where(eq(findings.signature, f.signature));
  });
  refresh();
}

export async function flagFinding(formData: FormData) {
  const f = await findingById(Number(formData.get("id")));
  await (await getDb()).update(findings).set({ status: "follow_up" }).where(eq(findings.signature, f.signature));
  refresh();
}

export async function reopenFinding(formData: FormData) {
  const f = await findingById(Number(formData.get("id")));
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.delete(dismissals).where(eq(dismissals.findingSignature, f.signature));
    await tx.update(findings).set({ status: "open" }).where(eq(findings.signature, f.signature));
  });
  refresh();
}

// ---- change impact ------------------------------------------------------------

async function impactContext() {
  const db = await getDb();
  return { ctx: { db, ledger: new Ledger(db), gateway: availableGateway(["extract", "judge"]).gateway }, judgeSettings: judgeSettingsFromEnv() };
}

/** Upload an edited .fountain file as the next version of the script, then show its impact. */
export async function uploadEditedScript(formData: FormData) {
  const baseId = Number(formData.get("baseId"));
  const file = formData.get("script");
  if (!(file instanceof File) || file.size === 0) throw new Error("choose a .fountain file to upload");
  const { ctx, judgeSettings } = await impactContext();
  const r = await applyScriptEdit(ctx, baseId, await file.text(), judgeSettings);
  redirect(`/impact?from=${r.from.id}&to=${r.to.id}`);
}

/** Replace one scene's text, save it as the next version, then show its impact. */
export async function editSceneText(formData: FormData) {
  const baseId = Number(formData.get("baseId"));
  const scene = String(formData.get("scene") ?? "");
  const text = String(formData.get("text") ?? "");
  if (!scene || !text.trim()) throw new Error("pick a scene and enter its new text");
  const { ctx, judgeSettings } = await impactContext();
  const r = await applySceneEdit(ctx, baseId, scene, text, judgeSettings);
  redirect(`/impact?from=${r.from.id}&to=${r.to.id}`);
}

// ---- loading a project ----------------------------------------------------------

async function fileText(formData: FormData, name: string): Promise<{ name: string; text: string } | undefined> {
  const f = formData.get(name);
  if (!(f instanceof File) || f.size === 0) return undefined;
  return { name: f.name, text: await f.text() };
}

async function ingestAndCheck(input: IngestInput) {
  const { ctx, judgeSettings } = await impactContext();
  const report = await ingest(ctx, input);
  await runChecks(ctx.db, report.scriptDocId, { judgeCtx: ctx, judgeSettings });
  redirect("/");
}

/** Ingest an uploaded script (and optional sheets), run every check, and open the review. */
export async function loadProject(formData: FormData) {
  const script = await fileText(formData, "script");
  if (!script) throw new Error("choose a .fountain file to upload");
  await ingestAndCheck({ script, costumes: await fileText(formData, "costumes"), locations: await fileText(formData, "locations") });
}

/** Ingest the sample script and sheets shipped in data/. */
export async function loadSampleProject() {
  const read = (file: string) => ({ name: file, text: fs.readFileSync(path.join(process.cwd(), "data", file), "utf8") });
  await ingestAndCheck({ script: read("script.fountain"), costumes: read("costumes.csv"), locations: read("locations.csv") });
}
