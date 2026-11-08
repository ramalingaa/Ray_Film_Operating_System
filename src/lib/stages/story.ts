/**
 * Stage 2 — Story. One Story Analyst call reads the whole script and returns
 * logline elements, the 15 beats, a card per scene, and setups. Code then
 * verifies every citation against the script (unverifiable items are
 * dropped), measures where each beat lands, and turns gaps into findings.
 */
import { z } from "zod";
import { cachedGenerate } from "../agents/cached";
import { STORY_PROMPT_VERSION, STORY_SYSTEM, storyUserPrompt } from "../extract/prompts";
import { verifySource } from "../extract/provenance";
import { parseFountain, type ParsedScene, type ParsedScript } from "../fountain";
import { sceneEighths } from "../intake/pages";
import { BEAT_IDS, BEATS, beatTiming, outOfOrder, pct, SHORT_FORM_PAGES, type BeatId, type BeatTiming } from "../story/beats";
import type { Cite, StageDef } from "./types";

const source = {
  source_line: z.number().int(),
  source_snippet: z.string(),
};

export const StoryAnalysisSchema = z.object({
  logline: z.object({
    protagonist: z.string().nullable(),
    goal: z.string().nullable(),
    stakes: z.string().nullable(),
    obstacle: z.string().nullable(),
    one_sentence: z.string().describe("The logline in one sentence, from what the script shows"),
    missing: z.array(z.string()).describe("Which of protagonist, goal, stakes, obstacle the script does not make clear"),
    ...source,
  }),
  beats: z.array(
    z.object({
      beat: z.enum(BEAT_IDS),
      scene_number: z.string().nullable().describe("Scene that delivers the beat, or null if none does"),
      note: z.string().describe("One sentence: how this scene delivers the beat, or why no scene does"),
      ...source,
    }),
  ),
  scenes: z.array(
    z.object({
      scene_number: z.string(),
      purpose: z.string(),
      conflict: z.string().nullable(),
      start_value: z.string().describe("The situation or value at the start of the scene"),
      end_value: z.string().describe("The situation or value at the end"),
      turns: z.boolean().describe("True if the situation is meaningfully different at the end"),
      ...source,
    }),
  ),
  setups: z.array(
    z.object({
      description: z.string(),
      setup_scene: z.string(),
      payoff_scene: z.string().nullable(),
      ...source,
    }),
  ),
});
export type StoryAnalysis = z.infer<typeof StoryAnalysisSchema>;

export interface StoryIssue {
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  cites: Cite[];
}

export interface StoryReport {
  model: string;
  cacheHit: boolean;
  shortForm: boolean;
  logline: StoryAnalysis["logline"] & { cite?: Cite };
  beats: { id: BeatId; title: string; scene: string | null; position: number | null; expected: string; timing: BeatTiming; note: string; cite?: Cite }[];
  scenes: { number: string; heading: string; purpose: string; conflict: string | null; start: string; end: string; turns: boolean; cite?: Cite }[];
  setups: { description: string; setupScene: string; payoffScene: string | null; cite?: Cite }[];
  issues: StoryIssue[];
  dropped: string[];
}

/** The screenplay with line numbers, and each scene heading marked with its scene number, so the model never has to count scenes. */
export function numberedScreenplay(text: string): string {
  const parsed = parseFountain(text);
  const sceneAt = new Map(parsed.scenes.map((s) => [s.startLine, s.number]));
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l, i) => {
      const n = sceneAt.get(i + 1);
      return n ? `${String(i + 1).padStart(5)} [scene ${n}]| ${l}` : `${String(i + 1).padStart(5)}| ${l}`;
    })
    .join("\n");
}

export function numberedScript(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l, i) => `${String(i + 1).padStart(5)}| ${l}`)
    .join("\n");
}

/** Verify a model citation against the scene it names (or the scene containing the line). */
function verify(parsed: ParsedScript, docName: string, sceneNumber: string | null, line: number, snippet: string): Cite | undefined {
  const byNumber = sceneNumber ? parsed.scenes.find((s) => s.number === sceneNumber) : undefined;
  const byLine = parsed.scenes.find((s) => line >= s.startLine && line <= s.endLine);
  for (const scene of [byNumber, byLine].filter((s): s is ParsedScene => !!s)) {
    const v = verifySource(scene, line, snippet);
    if (v.ok) return { docName, line: v.line, snippet: v.snippet, sceneNumber: scene.number };
  }
  return undefined;
}

/** Pure: turn a model analysis into a verified report. */
export function buildStoryReport(a: StoryAnalysis, scriptText: string, docName: string, meta: { model: string; cacheHit: boolean }): StoryReport {
  const parsed = parseFountain(scriptText);
  const dropped: string[] = [];
  const first = parsed.scenes[0]?.startLine ?? 1;
  const last = Math.max(first + 1, parsed.lineCount);
  const positionOf = (line: number) => Math.min(1, Math.max(0, (line - first) / (last - first)));
  const pages = parsed.scenes.reduce((n, s) => n + sceneEighths(s), 0) / 8;
  const shortForm = pages < SHORT_FORM_PAGES;
  const heading = new Map(parsed.scenes.map((s) => [s.number, s.heading]));

  const loglineCite = verify(parsed, docName, null, a.logline.source_line, a.logline.source_snippet);

  const beats: StoryReport["beats"] = BEATS.map((b) => {
    const m = a.beats.find((x) => x.beat === b.id && x.scene_number);
    let cite: Cite | undefined;
    if (m) {
      cite = verify(parsed, docName, m.scene_number, m.source_line, m.source_snippet);
      if (!cite) dropped.push(`${b.title}: the quoted line was not found in scene ${m.scene_number}`);
    }
    const position = cite ? positionOf(cite.line) : null;
    return {
      id: b.id,
      title: b.title,
      scene: cite?.sceneNumber ?? null,
      position,
      expected: `${pct(b.range[0])}–${pct(b.range[1])}`,
      timing: beatTiming(b.id, position),
      note: (m ?? a.beats.find((x) => x.beat === b.id))?.note ?? "No scene was identified for this beat.",
      cite,
    };
  });

  const scenes: StoryReport["scenes"] = [];
  for (const s of parsed.scenes) {
    const card = a.scenes.find((c) => c.scene_number === s.number);
    if (!card) continue;
    let cite = verify(parsed, docName, s.number, card.source_line, card.source_snippet);
    if (!cite) dropped.push(`scene ${s.number} card: the quoted line was not found in the scene`);
    else if (cite.sceneNumber !== s.number) {
      // A card that quotes another scene describes that scene, not this one: do not attach it here.
      dropped.push(`scene ${s.number} card: it quotes scene ${cite.sceneNumber}, so it was not used`);
      cite = undefined;
      continue;
    }
    scenes.push({ number: s.number, heading: s.heading, purpose: card.purpose, conflict: card.conflict, start: card.start_value, end: card.end_value, turns: card.turns, cite });
  }

  const setups: StoryReport["setups"] = [];
  for (const x of a.setups) {
    const cite = verify(parsed, docName, x.setup_scene, x.source_line, x.source_snippet);
    if (!cite) {
      dropped.push(`setup "${x.description}": the quoted line was not found in scene ${x.setup_scene}`);
      continue;
    }
    const payoff = x.payoff_scene && heading.has(x.payoff_scene) ? x.payoff_scene : null;
    setups.push({ description: x.description, setupScene: cite.sceneNumber!, payoffScene: payoff, cite });
  }

  // ---- findings -----------------------------------------------------------------
  const issues: StoryIssue[] = [];
  const cites = (c?: Cite) => (c ? [c] : []);
  const missingCore = a.logline.missing.filter((m) => /protagonist|goal/i.test(m));
  if (missingCore.length) {
    issues.push({ severity: "high", title: `The script does not make the ${missingCore.join(" and ")} clear`, detail: `Logline read: ${a.logline.one_sentence}`, cites: cites(loglineCite) });
  } else if (a.logline.missing.length) {
    issues.push({ severity: "medium", title: `Unclear: ${a.logline.missing.join(", ")}`, detail: `Logline read: ${a.logline.one_sentence}`, cites: cites(loglineCite) });
  }

  const beatSeverity = shortForm ? "low" : "medium";
  for (const b of beats) {
    if (b.timing === "missing") {
      issues.push({ severity: beatSeverity, title: `No scene delivers the ${b.title}`, detail: b.note, cites: [] });
    } else if (b.timing !== "on_time") {
      issues.push({
        severity: "low",
        title: `${b.title} lands ${b.timing} (${pct(b.position!)} of the script)`,
        detail: `In scene ${b.scene}. It usually lands at ${b.expected}.${shortForm ? " For a short film this is guidance only." : ""}`,
        cites: cites(b.cite),
      });
    }
  }
  const positions = Object.fromEntries(beats.filter((b) => b.position != null).map((b) => [b.id, b.position!])) as Partial<Record<BeatId, number>>;
  for (const [x, y] of outOfOrder(positions)) {
    const bx = beats.find((b) => b.id === x)!;
    const by = beats.find((b) => b.id === y)!;
    issues.push({ severity: beatSeverity, title: `${bx.title} comes after ${by.title}`, detail: `Scene ${bx.scene} (${bx.title}) follows scene ${by.scene} (${by.title}).`, cites: [...cites(bx.cite), ...cites(by.cite)] });
  }

  for (const s of scenes.filter((x) => !x.turns)) {
    issues.push({ severity: "low", title: `Scene ${s.number} does not turn`, detail: `It starts at “${s.start}” and ends at “${s.end}”. Purpose: ${s.purpose}`, cites: cites(s.cite) });
  }
  const uncarded = parsed.scenes.filter((s) => !scenes.some((c) => c.number === s.number)).map((s) => s.number);
  if (uncarded.length) dropped.push(`no scene card returned for scene${uncarded.length > 1 ? "s" : ""} ${uncarded.join(", ")}`);

  for (const x of setups.filter((s) => !s.payoffScene)) {
    issues.push({ severity: "medium", title: `Set up in scene ${x.setupScene}, never paid off`, detail: x.description, cites: cites(x.cite) });
  }

  const rank = { high: 0, medium: 1, low: 2 };
  issues.sort((p, q) => rank[p.severity] - rank[q.severity]);
  return { ...meta, shortForm, logline: { ...a.logline, cite: loglineCite }, beats, scenes, setups, issues, dropped };
}

/** A stage that needs a model reports this instead of failing when none is configured. */
export interface Skipped {
  skipped: string;
}

export const storyStage: StageDef<StoryReport | Skipped> = {
  id: "story",
  title: "Story",
  summary: "Logline, the 15 beats and where they land, a card for every scene, and setups that never pay off.",
  async step({ ctx, run }) {
    if (!run.scriptText) throw new Error("intake has not produced a script yet");
    if (!ctx.gateway) return { done: true, report: { skipped: "The story read needs a model, and none is configured." } };
    const r = await cachedGenerate(
      ctx,
      "extract",
      STORY_PROMPT_VERSION,
      { system: STORY_SYSTEM, user: storyUserPrompt(run.title, numberedScreenplay(run.scriptText)), schema: StoryAnalysisSchema, schemaName: "story_analysis", maxTokens: 6000 },
      "story-analyst",
      `run ${run.id}`,
      (a) => {
        const scenes = parseFountain(run.scriptText!).scenes.length;
        const cards = a.scenes.length;
        const placed = a.beats.filter((b) => b.scene_number).length;
        if (cards < Math.ceil(scenes * 0.8)) return `scene cards for only ${cards} of ${scenes} scenes (numbered ${parseFountain(run.scriptText!).scenes.map((s) => s.number).join(", ")})`;
        if (placed < Math.min(5, scenes)) return `only ${placed} of 15 beats placed in a scene`;
        return null;
      },
    );
    const report = buildStoryReport(r.data, run.scriptText, run.scriptGenerated ? "generated outline" : run.sourceName, { model: r.model, cacheHit: r.cacheHit });
    for (const d of report.dropped) await ctx.ledger.issue("story-analyst", "warning", `run ${run.id}`, d);
    return { done: true, report };
  },
};
