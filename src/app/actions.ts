"use server";

import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { agentTurn, resumeAgent, sendToAgent, stopAgent, welcomeProject, type AgentTurnOutcome, type Attachment } from "@/lib/agent/loop";
import { Ledger } from "@/lib/agents/runtime";
import { judgeSettingsFromEnv } from "@/lib/checks/judge";
import { getDb } from "@/lib/db/client";
import { dismissals, findings } from "@/lib/db/schema";
import { applySceneEdit, applyScriptEdit } from "@/lib/impact/apply";
import { availableGateway } from "@/lib/llm/available";
import {
  approveChapter,
  createProject,
  reopenChapter,
  retryRun,
  setScript,
  stepRun,
  updateStory,
  writeScriptFromStory,
  type StepOutcome,
} from "@/lib/pipeline/runs";

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

// ---- runs: upload or paste, then step through the stages -------------------------

async function fileText(formData: FormData, name: string): Promise<{ name: string; text: string } | undefined> {
  const f = formData.get(name);
  if (!(f instanceof File) || f.size === 0) return undefined;
  return { name: f.name, text: await f.text() };
}

/** Start a chat-first project: only its name. Everything else happens in the conversation with its agent. */
export async function startProject(formData: FormData) {
  const db = await getDb();
  const title = String(formData.get("title") ?? "");
  const id = await createProject(db, title);
  await welcomeProject(db, id, title.trim());
  redirect(`/projects/${id}`);
}

const readSample = (file: string) => ({ name: file, text: fs.readFileSync(path.join(process.cwd(), "data", file), "utf8") });

/**
 * Open a sample the way a person would: a new project, then a first message
 * with the files attached. The agent takes it from there.
 */
async function startSample(title: string, message: string, files: { name: string; text: string }[]): Promise<never> {
  const db = await getDb();
  const id = await createProject(db, title);
  await welcomeProject(db, id, title);
  await sendToAgent(db, id, message, files);
  after(() => advanceAgent(id).catch((err) => console.error(`project ${id}: first agent turn failed:`, err)));
  redirect(`/projects/${id}`);
}

/** The sample screenplay and its sheets, shipped in data/. */
export async function startSampleRun() {
  await startSample("The Keeper's Ledger", "Here is my screenplay, with the costume and location sheets.", [readSample("script.fountain"), readSample("costumes.csv"), readSample("locations.csv")]);
}

/** The sample story, shipped in data/. */
export async function startSampleStory() {
  await startSample("The Night Ferry", "Here is my story. Take it all the way to a plan.", [readSample("sample-story.txt")]);
}

// ---- the project agent ----------------------------------------------------------

/** One agent turn (called repeatedly by the workspace while the agent is running). */
export async function advanceAgent(runId: number): Promise<AgentTurnOutcome> {
  return agentTurn(await getDb(), runId, {
    agentGateway: availableGateway(["agent"]).gateway,
    stageGateway: availableGateway(["extract", "judge"]).gateway,
    judgeSettings: judgeSettingsFromEnv(),
  });
}

/**
 * Send the user's message and any attached files. Returns an error message
 * instead of throwing, so the composer can show it (production hides thrown
 * errors).
 */
export async function sendAgentMessage(formData: FormData): Promise<{ error?: string }> {
  try {
    const files: Attachment[] = [];
    for (const f of formData.getAll("files")) {
      if (f instanceof File && f.size > 0) files.push({ name: f.name, text: await f.text() });
    }
    await sendToAgent(await getDb(), runId(formData), String(formData.get("message") ?? ""), files);
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
  refresh();
  return {};
}

export async function stopAgentAction(formData: FormData) {
  await stopAgent(await getDb(), runId(formData));
  refresh();
}

export async function resumeAgentAction(formData: FormData) {
  await resumeAgent(await getDb(), runId(formData));
  refresh();
}

/** Advance a run by one step (called repeatedly by the run page while it is open). */
export async function advanceRun(runId: number): Promise<StepOutcome> {
  const db = await getDb();
  return stepRun(db, runId, { gateway: availableGateway(["extract", "judge"]).gateway, judgeSettings: judgeSettingsFromEnv() });
}

export async function retryFailedRun(formData: FormData) {
  await retryRun(await getDb(), Number(formData.get("id")));
  refresh();
}

// ---- chapter gates -------------------------------------------------------------------

const runId = (formData: FormData) => Number(formData.get("id"));

export async function approveChapterAction(formData: FormData) {
  await approveChapter(await getDb(), runId(formData), Number(formData.get("chapter")));
  redirect(`/runs/${runId(formData)}`);
}

export async function reopenChapterAction(formData: FormData) {
  const chapter = Number(formData.get("chapter"));
  await reopenChapter(await getDb(), runId(formData), chapter);
  redirect(`/runs/${runId(formData)}?chapter=${chapter}`);
}

export async function updateStoryAction(formData: FormData) {
  await updateStory(await getDb(), runId(formData), String(formData.get("story") ?? ""));
  redirect(`/runs/${runId(formData)}?chapter=0`);
}

export async function setScriptAction(formData: FormData) {
  const file = await fileText(formData, "file");
  const text = file?.text ?? String(formData.get("script") ?? "");
  await setScript(await getDb(), runId(formData), text);
  redirect(`/runs/${runId(formData)}?chapter=1`);
}

export async function writeScriptAction(formData: FormData) {
  await writeScriptFromStory(await getDb(), runId(formData));
  redirect(`/runs/${runId(formData)}?chapter=1`);
}
