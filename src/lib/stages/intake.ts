/**
 * Stage 1 — Intake. Classify the input, convert Final Draft, adapt a story into
 * a Fountain outline, and measure the script (scenes, page eighths, running time).
 */
import { parseFountain } from "../fountain";
import { adaptStory } from "../intake/adapt";
import { classifyInput } from "../intake/classify";
import { formatEighths, sceneEighths } from "../intake/pages";
import type { StageDef } from "./types";

export interface IntakeReport {
  kind: "screenplay" | "story";
  format: "fountain" | "fdx" | "prose";
  reason: string;
  words: number;
  generated: boolean;
  adaptation?: { model: string; cacheHit: boolean; unsupportedScenes: number[] };
  title: string | null;
  scenes: { number: string; heading: string; startLine: number; eighths: number; pages: string; flashback: boolean }[];
  totalEighths: number;
  totalPages: string;
  /** Rule of thumb: one page ≈ one minute. */
  runtimeMinutes: number;
  warnings: string[];
}

export const intakeStage: StageDef<IntakeReport> = {
  id: "intake",
  title: "Intake",
  summary: "Detect screenplay or story, convert or adapt it, and measure scenes, pages and running time.",
  async step({ ctx, run }) {
    const warnings: string[] = [];
    let adaptation: IntakeReport["adaptation"];
    let generated = run.scriptGenerated;
    let c: ReturnType<typeof classifyInput>;
    let scriptText: string;

    if (run.scriptText) {
      c = classifyInput(run.scriptText, run.sourceName);
      if (c.kind !== "screenplay") {
        throw new Error("This does not read as a screenplay (no scene headings such as INT. KITCHEN - DAY). Paste a screenplay, or have it written from the story.");
      }
      scriptText = c.text; // Final Draft converted to Fountain
    } else if (run.scriptMode === "adapt" && run.storyText) {
      if (!ctx.gateway) throw new Error("Writing a screenplay from the story needs a model. Configure a model key, or provide your own screenplay.");
      c = classifyInput(run.storyText);
      const a = await adaptStory(ctx, run.title, run.storyText);
      scriptText = a.fountain;
      generated = true;
      adaptation = { model: a.model, cacheHit: a.cacheHit, unsupportedScenes: a.unsupportedScenes };
      if (a.unsupportedScenes.length) {
        warnings.push(`Generated scene${a.unsupportedScenes.length > 1 ? "s" : ""} ${a.unsupportedScenes.join(", ")} could not be traced to a quoted passage of the story. Check them against your story.`);
      }
    } else {
      return { done: false, awaiting: "Choose how the screenplay is made: write it from the story, or provide your own." };
    }

    const parsed = parseFountain(scriptText);
    if (parsed.scenes.length === 0) throw new Error("No scenes found. A screenplay needs scene headings such as INT. KITCHEN - DAY.");
    const scenes = parsed.scenes.map((s) => {
      const eighths = sceneEighths(s);
      return { number: s.number, heading: s.heading, startLine: s.startLine, eighths, pages: formatEighths(eighths), flashback: s.isFlashback };
    });
    const totalEighths = scenes.reduce((n, s) => n + s.eighths, 0);

    const seen = new Map<string, number>();
    for (const s of parsed.scenes) seen.set(s.number, (seen.get(s.number) ?? 0) + 1);
    const dupes = [...seen].filter(([, n]) => n > 1).map(([k]) => k);
    if (dupes.length) warnings.push(`Scene number${dupes.length > 1 ? "s" : ""} ${dupes.join(", ")} appear more than once; numbered scenes must be unique for scheduling.`);
    const empty = parsed.scenes.filter((s) => !s.elements.some((e) => e.type === "action" || e.type === "dialogue")).map((s) => s.number);
    if (empty.length) warnings.push(`Scene${empty.length > 1 ? "s" : ""} ${empty.join(", ")} ha${empty.length > 1 ? "ve" : "s"} a heading but no action or dialogue.`);
    const noTime = parsed.scenes.filter((s) => !s.timeOfDay || s.timeOfDay === "UNKNOWN").map((s) => s.number);
    if (noTime.length) warnings.push(`Scene${noTime.length > 1 ? "s" : ""} ${noTime.join(", ")} ha${noTime.length > 1 ? "ve" : "s"} no time of day in the heading (DAY, NIGHT, ...), which scheduling needs.`);

    return {
      done: true,
      runPatch: { scriptText, scriptGenerated: generated },
      report: {
        kind: generated ? "story" : "screenplay",
        format: c.format,
        reason: generated ? "written from the approved story" : c.reason,
        words: c.words,
        generated,
        adaptation,
        title: parsed.titlePage.title ?? null,
        scenes,
        totalEighths,
        totalPages: formatEighths(totalEighths),
        runtimeMinutes: Math.round(totalEighths / 8),
        warnings,
      },
    };
  },
};
