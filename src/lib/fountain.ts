/**
 * Fountain screenplay parser that keeps exact 1-based source line numbers for
 * every element. Follows https://fountain.io/syntax for the elements we need:
 * title page, scene headings (incl. forced "." and #scene numbers#), action,
 * character cues (incl. forced "@", extensions, dual-dialogue "^"), dialogue,
 * parentheticals, transitions, centered text, sections, synopses, notes,
 * boneyard and page breaks.
 */

export type ElementType =
  | "scene_heading"
  | "action"
  | "character"
  | "dialogue"
  | "parenthetical"
  | "transition"
  | "centered"
  | "section"
  | "synopsis"
  | "page_break"
  | "lyric";

export interface Element {
  type: ElementType;
  text: string;
  /** 1-based line in the source file. */
  line: number;
  /** For character / dialogue / parenthetical: the normalized speaker name. */
  character?: string;
  /** For character cues: V.O., O.S., CONT'D, ... */
  extension?: string;
}

export interface ExplicitDay {
  day: number;
  line: number;
  snippet: string;
}

export interface ParsedScene {
  ordinal: number;
  number: string;
  heading: string;
  intExt: string;
  location: string;
  timeOfDay: string;
  isFlashback: boolean;
  startLine: number;
  endLine: number;
  text: string;
  elements: Element[];
  /** Speaking characters (normalized cue names) in order of first line. */
  speakers: string[];
  explicitDay?: ExplicitDay;
}

export interface ParsedScript {
  titlePage: Record<string, string>;
  scenes: ParsedScene[];
  /** Elements that appear before the first scene heading. */
  preamble: Element[];
  lineCount: number;
}

const HEADING_PREFIX = /^(INT\.?\/EXT|EXT\.?\/INT|INT\/EXT|I\/E|INT|EXT|EST)[.\s]/i;
const SCENE_NUMBER = /\s*#([\w.\-]+)#\s*$/;

const TIME_WORDS = new Set([
  "DAY",
  "NIGHT",
  "MORNING",
  "AFTERNOON",
  "EVENING",
  "DUSK",
  "DAWN",
  "SUNRISE",
  "SUNSET",
  "NOON",
  "MIDNIGHT",
  "MAGIC HOUR",
  "LATE NIGHT",
  "EARLY MORNING",
  "LATER",
  "MOMENTS LATER",
  "SECONDS LATER",
  "MINUTES LATER",
  "CONTINUOUS",
  "SAME",
  "SAME TIME",
]);

const NUMBER_WORDS: Record<string, number> = {
  ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5, SIX: 6, SEVEN: 7, EIGHT: 8, NINE: 9, TEN: 10,
  ELEVEN: 11, TWELVE: 12, THIRTEEN: 13, FOURTEEN: 14, FIFTEEN: 15, SIXTEEN: 16,
  SEVENTEEN: 17, EIGHTEEN: 18, NINETEEN: 19, TWENTY: 20, THIRTY: 30,
};

const CUE_EXTENSION = /\(([^)]*)\)/g;

/** Split "JOHN (V.O.) (CONT'D)" into a canonical name and its extension. */
export function normalizeCue(raw: string): { name: string; extension?: string } {
  let s = raw.trim();
  if (s.startsWith("@")) s = s.slice(1);
  if (s.endsWith("^")) s = s.slice(0, -1).trim();
  const exts: string[] = [];
  s = s.replace(CUE_EXTENSION, (_, e: string) => {
    exts.push(e.trim().toUpperCase());
    return "";
  });
  const name = s.replace(/\s+/g, " ").trim().toUpperCase();
  return exts.length ? { name, extension: exts.join(" ") } : { name };
}

function parseDayToken(token: string): number | undefined {
  if (/^\d+$/.test(token)) return Number(token);
  return NUMBER_WORDS[token.toUpperCase()];
}

/** Parse the part of a heading after INT./EXT. into location and time of day. */
export function splitHeading(body: string): { location: string; timeOfDay: string; day?: number } {
  const clean = body.replace(/\((?:FLASHBACK|PRESENT|DREAM)[^)]*\)/gi, "").trim();
  const parts = clean.split(/\s+[-–—]\s+/);
  if (parts.length > 1) {
    const last = parts[parts.length - 1].trim().toUpperCase();
    const dayMatch = /^DAY\s+(\w+)$/.exec(last);
    if (dayMatch && parseDayToken(dayMatch[1]) !== undefined) {
      return { location: parts.slice(0, -1).join(" - ").trim(), timeOfDay: "DAY", day: parseDayToken(dayMatch[1]) };
    }
    if (TIME_WORDS.has(last)) {
      return { location: parts.slice(0, -1).join(" - ").trim(), timeOfDay: last };
    }
  }
  return { location: clean, timeOfDay: "UNKNOWN" };
}

function normalizeIntExt(prefix: string): string {
  const p = prefix.toUpperCase().replace(/\./g, "");
  if (p === "I/E" || p === "INT/EXT" || p === "EXT/INT") return "INT/EXT";
  return p;
}

function isUpperCaseName(s: string): boolean {
  const base = s.replace(CUE_EXTENSION, "").replace(/\^$/, "").trim();
  return base.length > 0 && /[A-Z]/.test(base) && !/[a-z]/.test(base) && /^[A-Z0-9 .'\-&]+$/.test(base);
}

/** Replace notes and boneyard with spaces so line numbers are preserved. */
function stripNotesAndBoneyard(src: string): string {
  const blank = (m: string) => m.replace(/[^\n]/g, " ");
  return src.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/\[\[[\s\S]*?\]\]/g, blank);
}

const EXPLICIT_DAY_LINE = /^(?:SUPER|TITLE|CARD|CHYRON|TITLE CARD)\s*:\s*.*?\bDAY\s+(\w+)\b/i;

export function parseFountain(source: string): ParsedScript {
  const lines = stripNotesAndBoneyard(source.replace(/\r\n?/g, "\n")).split("\n");
  const rawLines = source.replace(/\r\n?/g, "\n").split("\n");
  const titlePage: Record<string, string> = {};
  const scenes: ParsedScene[] = [];
  const preamble: Element[] = [];

  let i = 0;
  // Title page: key: value pairs at the very top, ending at the first blank line.
  if (/^[A-Za-z][A-Za-z ]*:/.test(lines[0] ?? "")) {
    let key = "";
    for (; i < lines.length && lines[i].trim() !== ""; i++) {
      const m = /^([A-Za-z][A-Za-z ]*):\s*(.*)$/.exec(lines[i]);
      if (m) {
        key = m[1].trim().toLowerCase();
        titlePage[key] = m[2].trim();
      } else if (key) {
        titlePage[key] = [titlePage[key], lines[i].trim()].filter(Boolean).join("\n");
      }
    }
  }

  let current: ParsedScene | null = null;
  let speaker: string | undefined;
  let inFlashbackBlock = false;

  const push = (el: Element) => {
    if (current) {
      current.elements.push(el);
      if (el.type === "character" && el.character && !current.speakers.includes(el.character)) {
        current.speakers.push(el.character);
      }
      if (el.type === "action" && !current.explicitDay) {
        const m = EXPLICIT_DAY_LINE.exec(el.text.trim());
        const day = m ? parseDayToken(m[1]) : undefined;
        if (day !== undefined) current.explicitDay = { day, line: el.line, snippet: el.text.trim() };
      }
    } else {
      preamble.push(el);
    }
  };

  const prevBlank = (idx: number) => idx === 0 || lines[idx - 1].trim() === "";
  const nextBlank = (idx: number) => idx + 1 >= lines.length || lines[idx + 1].trim() === "";

  for (; i < lines.length; i++) {
    const raw = lines[i];
    const t = raw.trim();
    const lineNo = i + 1;

    if (t === "") {
      speaker = undefined;
      continue;
    }

    // Dialogue block continuation.
    if (speaker) {
      if (/^\(.*\)$/.test(t)) push({ type: "parenthetical", text: t, line: lineNo, character: speaker });
      else push({ type: "dialogue", text: t, line: lineNo, character: speaker });
      continue;
    }

    if (/^={3,}$/.test(t)) {
      push({ type: "page_break", text: t, line: lineNo });
      continue;
    }
    if (t.startsWith("#") && !SCENE_NUMBER.test(t)) {
      push({ type: "section", text: t.replace(/^#+\s*/, ""), line: lineNo });
      continue;
    }
    if (t.startsWith("=")) {
      push({ type: "synopsis", text: t.replace(/^=\s*/, ""), line: lineNo });
      continue;
    }

    const forcedHeading = t.startsWith(".") && !t.startsWith("..");
    if (prevBlank(i) && (forcedHeading || HEADING_PREFIX.test(t))) {
      let heading = forcedHeading ? t.slice(1).trim() : t;
      let number: string | undefined;
      const num = SCENE_NUMBER.exec(heading);
      if (num) {
        number = num[1];
        heading = heading.replace(SCENE_NUMBER, "").trim();
      }
      const prefixMatch = HEADING_PREFIX.exec(heading);
      const intExt = prefixMatch ? normalizeIntExt(prefixMatch[1]) : "UNKNOWN";
      const body = prefixMatch ? heading.slice(prefixMatch[0].length).trim() : heading;
      const { location, timeOfDay, day } = splitHeading(body);
      const ordinal = scenes.length + 1;
      current = {
        ordinal,
        number: number ?? String(ordinal),
        heading,
        intExt,
        location: location.toUpperCase(),
        timeOfDay,
        isFlashback: inFlashbackBlock || /\bFLASHBACK\b/i.test(heading),
        startLine: lineNo,
        endLine: lineNo,
        text: "",
        elements: [],
        speakers: [],
        explicitDay:
          day !== undefined ? { day, line: lineNo, snippet: heading } : undefined,
      };
      scenes.push(current);
      push({ type: "scene_heading", text: heading, line: lineNo });
      continue;
    }

    if (/^(BEGIN\s+)?FLASHBACK:?$/i.test(t)) inFlashbackBlock = true;
    if (/^(END\s+(OF\s+)?FLASHBACK|BACK\s+TO\s+(THE\s+)?PRESENT)\.?:?$/i.test(t)) inFlashbackBlock = false;

    if (t.startsWith(">") && t.endsWith("<")) {
      push({ type: "centered", text: t.slice(1, -1).trim(), line: lineNo });
      continue;
    }
    if (t.startsWith(">") || (prevBlank(i) && nextBlank(i) && /^[A-Z0-9 .'\-]+TO:$/.test(t))) {
      push({ type: "transition", text: t.replace(/^>\s*/, ""), line: lineNo });
      continue;
    }
    if (t.startsWith("~")) {
      push({ type: "lyric", text: t.slice(1).trim(), line: lineNo });
      continue;
    }

    const forcedCue = t.startsWith("@");
    if (prevBlank(i) && !nextBlank(i) && (forcedCue || isUpperCaseName(t))) {
      const { name, extension } = normalizeCue(t);
      speaker = name;
      push({ type: "character", text: t, line: lineNo, character: name, extension });
      continue;
    }

    push({ type: "action", text: t.startsWith("!") ? t.slice(1) : t, line: lineNo });
  }

  // Close scene ranges: last non-blank line before the next heading.
  for (let s = 0; s < scenes.length; s++) {
    const scene = scenes[s];
    const limit = s + 1 < scenes.length ? scenes[s + 1].startLine - 1 : lines.length;
    let end = scene.startLine;
    for (let l = limit; l >= scene.startLine; l--) {
      if (lines[l - 1].trim() !== "") {
        end = l;
        break;
      }
    }
    scene.endLine = end;
    scene.text = rawLines.slice(scene.startLine - 1, end).join("\n");
  }

  return { titlePage, scenes, preamble, lineCount: rawLines.length };
}

/** Render a scene with line numbers, the format models see during extraction. */
export function numberedSceneText(scene: Pick<ParsedScene, "text" | "startLine">): string {
  return scene.text
    .split("\n")
    .map((l, idx) => `${String(scene.startLine + idx).padStart(4, " ")}| ${l}`)
    .join("\n");
}
