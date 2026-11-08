/**
 * Adaptation agent: prose story → scene-by-scene Fountain outline. The model
 * returns structured scenes; code renders the Fountain, so headings are always
 * well-formed. Each scene must quote the story passage it comes from; scenes
 * whose quote is not in the story are kept but reported as unsupported.
 */
import { z } from "zod";
import { cachedGenerate } from "../agents/cached";
import type { AgentContext } from "../agents/runtime";
import { normalizeForMatch } from "../extract/provenance";
import { ADAPT_PROMPT_VERSION, ADAPT_SYSTEM, adaptUserPrompt } from "../extract/prompts";

export const AdaptationSchema = z.object({
  title: z.string(),
  scenes: z.array(
    z.object({
      int_ext: z.enum(["INT", "EXT", "INT/EXT"]),
      location: z.string(),
      time_of_day: z.string(),
      action: z.array(z.string()).describe("One to four short action paragraphs"),
      source_excerpt: z.string().describe("Exact words from the story this scene is based on, at most 25 words"),
    }),
  ),
});
export type Adaptation = z.infer<typeof AdaptationSchema>;

export interface AdaptedScript {
  fountain: string;
  model: string;
  cacheHit: boolean;
  /** Scenes (1-based) whose source excerpt was not found in the story. */
  unsupportedScenes: number[];
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** Render the structured outline as Fountain. Pure. */
export function renderOutline(a: Adaptation, title: string): string {
  const lines = [`Title: ${clean(a.title) || title}`, "Credit: Scene outline generated from a story by ReelGraph", ""];
  for (const s of a.scenes) {
    const location = clean(s.location).toUpperCase().replace(/^(INT|EXT)\.?\s+/, "") || "UNKNOWN";
    const time = clean(s.time_of_day).toUpperCase() || "DAY";
    lines.push(`${s.int_ext === "INT/EXT" ? "INT./EXT." : `${s.int_ext}.`} ${location} - ${time}`, "");
    for (const p of s.action.map(clean).filter(Boolean)) lines.push(p, "");
  }
  return lines.join("\n").trimEnd() + "\n";
}

export function unsupported(a: Adaptation, story: string): number[] {
  const haystack = normalizeForMatch(story);
  return a.scenes.flatMap((s, i) => {
    const parts = s.source_excerpt
      .split(/\.{3}|…/)
      .map(normalizeForMatch)
      .filter((p) => p.length > 0);
    return parts.length > 0 && parts.every((p) => haystack.includes(p)) ? [] : [i + 1];
  });
}

export async function adaptStory(ctx: AgentContext, title: string, story: string): Promise<AdaptedScript> {
  const r = await cachedGenerate(
    ctx,
    "extract",
    ADAPT_PROMPT_VERSION,
    { system: ADAPT_SYSTEM, user: adaptUserPrompt(title, story), schema: AdaptationSchema, schemaName: "scene_outline", maxTokens: 12000 },
    "adaptation",
  );
  if (r.data.scenes.length === 0) throw new Error("the adaptation agent returned no scenes");
  return { fountain: renderOutline(r.data, title), model: r.model, cacheHit: r.cacheHit, unsupportedScenes: unsupported(r.data, story) };
}
