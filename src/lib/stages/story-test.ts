/**
 * Chapter 1 — Story. Tests a prose story before any screenplay exists: logline
 * elements, which of the 15 beats are present and where, setups, strengths
 * and the producer's questions. Every citation is verified against the story
 * text; beat positions are measured by code. Skipped for productions that
 * started from a screenplay.
 */
import { z } from "zod";
import { cachedGenerate } from "../agents/cached";
import { STORY_DRAFT_PROMPT_VERSION, STORY_DRAFT_SYSTEM, storyDraftUserPrompt } from "../extract/prompts";
import { verifySource } from "../extract/provenance";
import { wordCount } from "../intake/classify";
import { BEAT_IDS, BEATS, beatTiming, outOfOrder, pct, type BeatId, type BeatTiming } from "../story/beats";
import { numberedScript, type Skipped, type StoryIssue } from "./story";
import type { Cite, StageDef } from "./types";

const cite = {
  source_line: z.number().int().nullable(),
  source_snippet: z.string().nullable(),
};

export const StoryDraftSchema = z.object({
  logline: z.object({
    protagonist: z.string().nullable(),
    goal: z.string().nullable(),
    stakes: z.string().nullable(),
    obstacle: z.string().nullable(),
    one_sentence: z.string(),
    missing: z.array(z.string()),
    ...cite,
  }),
  beats: z.array(z.object({ beat: z.enum(BEAT_IDS), present: z.boolean(), note: z.string(), ...cite })),
  setups: z.array(z.object({ description: z.string(), paid_off: z.boolean(), ...cite })),
  strengths: z.array(z.object({ point: z.string(), ...cite })),
  questions: z.array(z.object({ question: z.string(), why: z.string() })),
  characters: z.array(
    z.object({
      name: z.string(),
      role: z.enum(["protagonist", "antagonist", "supporting", "minor"]),
      want: z.string().nullable(),
      description: z.string(),
      age: z.number().int().nullable(),
      ...cite,
    }),
  ),
  relationships: z.array(z.object({ a: z.string(), b: z.string(), relation: z.string(), ...cite })),
});
export type StoryDraft = z.infer<typeof StoryDraftSchema>;

export interface StoryTestReport {
  model: string;
  cacheHit: boolean;
  words: number;
  /** Too short (a logline or paragraph) for beat positions to mean anything. */
  tooShortToTime: boolean;
  /** Short-film length: the 15 beats are a reference, so beat notes are low priority. */
  shortForm?: boolean;
  logline: Omit<StoryDraft["logline"], "source_line" | "source_snippet"> & { cite?: Cite };
  beats: { id: BeatId; title: string; present: boolean; position: number | null; expected: string; timing: BeatTiming; note: string; cite?: Cite }[];
  setups: { description: string; paidOff: boolean; cite?: Cite }[];
  strengths: { point: string; cite?: Cite }[];
  questions: StoryDraft["questions"];
  characters: { name: string; role: StoryDraft["characters"][number]["role"]; want: string | null; description: string; age: number | null; cite?: Cite }[];
  relationships: { a: string; b: string; relation: string; cite?: Cite }[];
  issues: StoryIssue[];
  dropped: string[];
}

const SHORT_WORDS = 400;
/** Under this many words, a story is short-film material (roughly 10 minutes or less). */
const SHORT_FILM_WORDS = 1500;

/** Pure: verify and measure a development read of `story`. */
export function buildStoryTestReport(a: StoryDraft, story: string, meta: { model: string; cacheHit: boolean }): StoryTestReport {
  const text = story.replace(/\r\n?/g, "\n");
  const lines = text.split("\n");
  const whole = { startLine: 1, text };
  const dropped: string[] = [];
  const words = wordCount(text);
  const tooShortToTime = words < SHORT_WORDS;
  /** Where in the text a citation starts: the line's offset plus where the quote sits in it (paragraphs are often one long line). */
  const offsetOf = (cite: Cite) => {
    const start = lines.slice(0, cite.line - 1).reduce((n, l) => n + l.length + 1, 0);
    const lineText = (lines[cite.line - 1] ?? "").toLowerCase();
    const head = cite.snippet.toLowerCase().split(/\s+/).slice(0, 4).join(" ");
    const within = lineText.indexOf(head);
    return start + (within >= 0 ? within : 0);
  };
  /** A short-film story: beat timings are a reference only. */
  const shortForm = words < SHORT_FILM_WORDS;

  const check = (what: string, line: number | null, snippet: string | null): Cite | undefined => {
    if (line == null || !snippet) return undefined;
    const v = verifySource(whole, line, snippet);
    if (v.ok) return { docName: "story", line: v.line, snippet: v.snippet };
    dropped.push(`${what}: the quoted words were not found in the story`);
    return undefined;
  };

  const beats: StoryTestReport["beats"] = BEATS.map((b) => {
    const m = a.beats.find((x) => x.beat === b.id);
    const c = m?.present ? check(b.title, m.source_line, m.source_snippet) : undefined;
    const present = !!m?.present && !!c;
    const position = c && !tooShortToTime ? Math.min(1, offsetOf(c) / Math.max(1, text.length)) : null;
    return {
      id: b.id,
      title: b.title,
      present,
      position,
      expected: `${pct(b.range[0])}–${pct(b.range[1])}`,
      timing: present ? (position == null ? "on_time" : beatTiming(b.id, position)) : "missing",
      note: m?.note ?? "Not addressed.",
      cite: c,
    };
  });

  const issues: StoryIssue[] = [];
  const loglineCite = check("logline", a.logline.source_line, a.logline.source_snippet);
  const core = a.logline.missing.filter((m) => /protagonist|goal/i.test(m));
  if (core.length) issues.push({ severity: "high", title: `The ${core.join(" and ")} ${core.length > 1 ? "are" : "is"} not clear yet`, detail: a.logline.one_sentence, cites: loglineCite ? [loglineCite] : [] });
  const rest = a.logline.missing.filter((m) => !/protagonist|goal/i.test(m));
  if (rest.length) issues.push({ severity: "medium", title: `Not clear yet: ${rest.join(", ")}`, detail: a.logline.one_sentence, cites: loglineCite ? [loglineCite] : [] });

  const missingSeverity = shortForm ? "low" : "medium";
  for (const b of beats.filter((x) => !x.present)) issues.push({ severity: missingSeverity, title: `No ${b.title} yet`, detail: b.note, cites: [] });
  for (const b of beats.filter((x) => x.present && x.timing !== "on_time")) {
    issues.push({ severity: "low", title: `${b.title} comes ${b.timing} (${pct(b.position!)} of the story)`, detail: `It usually lands at ${b.expected}. ${b.note}`, cites: b.cite ? [b.cite] : [] });
  }
  const positions = Object.fromEntries(beats.filter((b) => b.position != null).map((b) => [b.id, b.position!])) as Partial<Record<BeatId, number>>;
  for (const [x, y] of outOfOrder(positions)) {
    const bx = BEATS.find((b) => b.id === x)!.title;
    const by = BEATS.find((b) => b.id === y)!.title;
    issues.push({ severity: shortForm ? "low" : "medium", title: `${bx} comes after ${by}`, detail: "The turning points are out of their usual order.", cites: [] });
  }

  const setups = a.setups.map((s) => ({ description: s.description, paidOff: s.paid_off, cite: check(`setup "${s.description}"`, s.source_line, s.source_snippet) }));
  for (const s of setups.filter((x) => !x.paidOff)) issues.push({ severity: "medium", title: "Set up, never paid off", detail: s.description, cites: s.cite ? [s.cite] : [] });

  const rank = { high: 0, medium: 1, low: 2 };
  issues.sort((p, q) => rank[p.severity] - rank[q.severity]);
  return {
    ...meta,
    words,
    tooShortToTime,
    shortForm,
    logline: { protagonist: a.logline.protagonist, goal: a.logline.goal, stakes: a.logline.stakes, obstacle: a.logline.obstacle, one_sentence: a.logline.one_sentence, missing: a.logline.missing, cite: loglineCite },
    beats,
    setups,
    strengths: a.strengths.map((s) => ({ point: s.point, cite: check("strength", s.source_line, s.source_snippet) })),
    questions: a.questions,
    characters: a.characters.map((c) => ({ name: c.name, role: c.role, want: c.want, description: c.description, age: c.age, cite: check(`character ${c.name}`, c.source_line, c.source_snippet) })),
    // A relationship must join two known characters and quote the story; others are dropped.
    relationships: a.relationships.flatMap((x) => {
      const known = (n: string) => a.characters.some((c) => c.name.toLowerCase() === n.toLowerCase());
      if (!known(x.a) || !known(x.b)) {
        dropped.push(`relationship ${x.a}–${x.b}: names a character not in the cast list`);
        return [];
      }
      const c = check(`relationship ${x.a}–${x.b}`, x.source_line, x.source_snippet);
      return c ? [{ a: x.a, b: x.b, relation: x.relation, cite: c }] : [];
    }),
    issues,
    dropped,
  };
}

export const storyTestStage: StageDef<StoryTestReport | Skipped> = {
  id: "story_test",
  title: "Story test",
  summary: "A development read of the story: logline, the 15 beats, setups, strengths and the questions a producer would ask.",
  async step({ ctx, run }) {
    if (!run.storyText) return { done: true, report: { skipped: "This production started from a screenplay." } };
    if (!ctx.gateway) return { done: true, report: { skipped: "Testing a story needs a model, and none is configured." } };
    const r = await cachedGenerate(
      ctx,
      "extract",
      STORY_DRAFT_PROMPT_VERSION,
      { system: STORY_DRAFT_SYSTEM, user: storyDraftUserPrompt(run.title, numberedScript(run.storyText)), schema: StoryDraftSchema, schemaName: "story_draft", maxTokens: 6000 },
      "story-developer",
      `run ${run.id}`,
      (a) => {
        if (wordCount(run.storyText!) < 60) return null;
        if (a.characters.length === 0) return "no characters listed";
        if (a.beats.filter((b) => b.present).length < 3) return "fewer than 3 beats found";
        return null;
      },
    );
    const report = buildStoryTestReport(r.data, run.storyText, { model: r.model, cacheHit: r.cacheHit });
    for (const d of report.dropped) await ctx.ledger.issue("story-developer", "warning", `run ${run.id}`, d);
    return { done: true, report };
  },
};
