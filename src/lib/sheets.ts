/**
 * Deterministic loaders for the hand-made production sheets. No model involved:
 * every row becomes a record that keeps its exact CSV line for citations.
 */
import { parse } from "csv-parse/sync";

export interface CostumeRow {
  line: number;
  character: string;
  storyDay: number | null;
  /** Scene numbers this row covers; empty means "the whole story day". */
  scenes: string[];
  costume: string;
  state: string | null;
  snippet: string;
}

export interface LocationRow {
  line: number;
  name: string;
  aliases: string[];
  intExt: string;
  notes: string;
  snippet: string;
}

export class SheetError extends Error {}

type RawRecord = { record: Record<string, string>; info: { lines: number } };

function readRecords(csv: string, required: string[], sheet: string): RawRecord[] {
  const rows = parse(csv, {
    columns: (header: string[]) => header.map((h) => h.trim().toLowerCase()),
    skip_empty_lines: true,
    trim: true,
    info: true,
    bom: true,
  }) as RawRecord[];
  const first = rows[0]?.record;
  if (first) {
    const missing = required.filter((c) => !(c in first));
    if (missing.length) throw new SheetError(`${sheet}: missing column(s) ${missing.join(", ")}`);
  }
  return rows;
}

/** "3-5" → 3,4,5 · "3, 7" → 3,7 · "12A" → 12A · "" → [] */
export function expandSceneRange(range: string): string[] {
  const out: string[] = [];
  for (const part of range.split(/[,;]/).map((p) => p.trim()).filter(Boolean)) {
    const m = /^(\d+)\s*[-–]\s*(\d+)$/.exec(part);
    if (m) {
      const [a, b] = [Number(m[1]), Number(m[2])];
      if (b < a) throw new SheetError(`scene range "${part}" runs backwards`);
      for (let n = a; n <= b; n++) out.push(String(n));
    } else {
      out.push(part.toUpperCase());
    }
  }
  return out;
}

const snippetOf = (r: Record<string, string>) =>
  Object.values(r)
    .filter(Boolean)
    .join(" | ")
    .split(/\s+/)
    .slice(0, 25)
    .join(" ");

export function parseCostumeSheet(csv: string): CostumeRow[] {
  return readRecords(csv, ["character", "story_day", "scene_range", "costume"], "costumes.csv").map(
    ({ record: r, info }) => {
      const day = r.story_day ? Number(r.story_day) : null;
      if (day !== null && !Number.isInteger(day)) {
        throw new SheetError(`costumes.csv line ${info.lines}: story_day "${r.story_day}" is not a whole number`);
      }
      return {
        line: info.lines,
        character: r.character.toUpperCase(),
        storyDay: day,
        scenes: expandSceneRange(r.scene_range ?? ""),
        costume: r.costume,
        state: r.state ? r.state.toLowerCase() : null,
        snippet: snippetOf(r),
      };
    },
  );
}

export function parseLocationSheet(csv: string): LocationRow[] {
  return readRecords(csv, ["location_name", "aliases", "int_ext"], "locations.csv").map(({ record: r, info }) => ({
    line: info.lines,
    name: r.location_name.toUpperCase(),
    aliases: (r.aliases ?? "")
      .split(/[|;]/)
      .map((a) => a.trim().toUpperCase())
      .filter(Boolean),
    intExt: (r.int_ext ?? "").toUpperCase(),
    notes: r.notes ?? "",
    snippet: snippetOf(r),
  }));
}
