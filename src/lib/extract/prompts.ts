/** Bump whenever a prompt below changes: it is part of the extraction cache key. */
export const PROMPT_VERSION = "extract-v2";

export const EXTRACTION_SYSTEM = `You are a script supervisor building a continuity bible for a film.
You read ONE scene at a time and record facts that are stated in, or strongly implied by, the text of that scene.

Rules:
- Use only the text of the scene you are given. The context summary of earlier scenes is there to help you resolve names and story days; never copy facts from it.
- Do not invent. If something is not in the scene, leave it out. If you are unsure of a value, use "unknown" (or null) rather than guessing.
- Every item needs source_line (the number in the left margin) and source_snippet (exact words copied from that line, at most 25 words).
- Characters: everyone present, speaking or silent. Use the name as the script writes it.
- Costumes: one entry per garment per character, only when the scene describes what they wear. Include colour or material if stated. Record damage or wear (torn, wet, bloody, dirty, scorched).
- Props: objects that are handled, introduced, destroyed, lost, or that matter to the plot. A prop that is only talked about is "mentioned".
- Knowledge: a character "learns" a piece of information when it is revealed to them in this scene; a character "references" information when they state or act on something they already know.
- Story day: "explicit" only if the text states the day (e.g. SUPER: DAY 2). Otherwise choose same_day, next_day, later, earlier or unknown, and explain why in one sentence.
- Location details: concrete physical facts about the place (which floor, size, layout, condition, fixtures). Not mood or lighting.
- Time-of-day evidence: only concrete cues in action or dialogue (sunlight, "good morning", streetlights on). Do not repeat the heading.`;

export interface PromptContext {
  title?: string;
  sceneNumber: string;
  summary: string;
  numberedScene: string;
}

export function extractionUserPrompt(ctx: PromptContext): string {
  return [
    ctx.title ? `Screenplay: ${ctx.title}` : null,
    `Context from earlier scenes (for name and day resolution only):\n${ctx.summary || "(this is the first scene)"}`,
    `Scene ${ctx.sceneNumber}, with line numbers:\n${ctx.numberedScene}`,
    "Extract the continuity facts for this scene.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Bump whenever a judge prompt changes: it is part of the verdict cache key. */
export const JUDGE_PROMPT_VERSION = "judge-v1";

export const JUDGE_SYSTEM = `You are a script supervisor double-checking a possible continuity conflict that an automated check flagged in a screenplay.
You see the question for this check and the quoted evidence, with scene numbers and line numbers.

Decide whether the evidence shows a real conflict a script supervisor would raise with the writer.
- Judge only from the quoted evidence. Do not assume facts that are not quoted.
- A detail that is simply not mentioned is NOT a conflict. Only an explicit contradiction is.
- Allow for normal screenwriting shorthand and for things that can plausibly happen off-screen in the time available.
- Be conservative: when in doubt, answer conflict = false.

Return conflict (true or false), confidence between 0 and 1, and a one-sentence reason a writer would understand. Never say the writer is wrong; describe the two things that disagree.`;

export function judgeUserPrompt(question: string, evidence: string): string {
  return `Question: ${question}

Evidence:
${evidence}`;
}
