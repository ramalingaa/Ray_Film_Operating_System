import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import type { Agent } from "../agents/runtime";
import type { Db } from "../db/client";
import { llmCache } from "../db/schema";
import { numberedSceneText, type ParsedScene } from "../fountain";
import { EXTRACTION_SYSTEM, extractionUserPrompt, PROMPT_VERSION } from "./prompts";
import { SceneExtractionSchema, type SceneExtraction } from "./schema";

export interface SceneExtractionInput {
  scene: ParsedScene;
  summary: string;
  title?: string;
}

export interface SceneExtractionOutput {
  extraction: SceneExtraction;
  model: string;
  cacheHit: boolean;
}

export function extractionCacheKey(sceneText: string, models: string[]): string {
  return crypto
    .createHash("sha256")
    .update(`${PROMPT_VERSION}\u0000${models.join(",")}\u0000${sceneText}`)
    .digest("hex");
}

/** True when this scene's extraction is already cached (no model call needed). */
export async function isExtractionCached(db: Db, sceneText: string, models: string[]): Promise<boolean> {
  const [row] = await db.select({ key: llmCache.key }).from(llmCache).where(eq(llmCache.key, extractionCacheKey(sceneText, models)));
  return !!row;
}

/** Reads one scene and returns validated continuity facts. Cached per (scene text, prompt version, model list). */
export const sceneExtractor: Agent<SceneExtractionInput, SceneExtractionOutput> = {
  name: "scene-extractor",
  version: PROMPT_VERSION,
  async run({ scene, summary, title }, ctx) {
    if (!ctx.gateway) throw new Error("scene-extractor needs a model gateway");
    const models = ctx.gateway.specs("extract");
    const key = extractionCacheKey(scene.text, models);

    const [cached] = await ctx.db.select().from(llmCache).where(eq(llmCache.key, key));
    if (cached) {
      const parsed = SceneExtractionSchema.safeParse(JSON.parse(cached.responseJson));
      if (parsed.success) {
        return { output: { extraction: parsed.data, model: cached.model, cacheHit: true }, outcome: { model: cached.model, cacheHit: true } };
      }
      await ctx.ledger.issue("scene-extractor", "warning", `scene ${scene.number}`, "cached extraction no longer matches the schema; re-extracting");
    }

    const result = await ctx.gateway.generate("extract", {
      system: EXTRACTION_SYSTEM,
      user: extractionUserPrompt({ title, sceneNumber: scene.number, summary, numberedScene: numberedSceneText(scene) }),
      schema: SceneExtractionSchema,
      schemaName: "scene_extraction",
      maxTokens: 8000,
    });
    for (const a of result.attempts.filter((a) => a.outcome !== "ok")) {
      await ctx.ledger.issue("scene-extractor", "warning", `scene ${scene.number}`, `${a.model}: ${a.outcome} (${a.message})`);
    }

    await ctx.db
      .insert(llmCache)
      .values({ key, model: result.model, promptVersion: PROMPT_VERSION, responseJson: JSON.stringify(result.data) })
      .onConflictDoUpdate({ target: llmCache.key, set: { model: result.model, responseJson: JSON.stringify(result.data) } });

    return {
      output: { extraction: result.data, model: result.model, cacheHit: false },
      outcome: { model: result.model, cacheHit: false, usage: result.usage },
    };
  },
};
