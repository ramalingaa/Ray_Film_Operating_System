/**
 * Entity resolution. Names arrive from character cues ("MAYA (V.O.)"), action
 * introductions ("HARBORMASTER ELI VOSS (60s)"), model output ("Maya Reyes")
 * and sheets ("VOSS"). We fold them into canonical entities with conservative
 * rules and record every merge with the rule that justified it.
 */

export interface Merge {
  alias: string;
  canonical: string;
  rule: "normalized" | "title_stripped" | "unique_token_match" | "location_sheet" | "head_noun_match";
}

export interface Resolution {
  /** normalized input name → canonical name */
  map: Map<string, string>;
  canonicals: string[];
  merges: Merge[];
  /** Names that matched several candidates and were left unmerged. */
  ambiguous: { name: string; candidates: string[] }[];
}

const TITLES = new Set([
  "MR", "MRS", "MS", "MISS", "DR", "DOCTOR", "INSPECTOR", "DETECTIVE", "DET", "OFFICER", "SERGEANT", "SGT",
  "CAPTAIN", "CAPT", "LIEUTENANT", "LT", "AGENT", "PROFESSOR", "PROF", "HARBORMASTER", "SHERIFF", "DEPUTY",
  "JUDGE", "NURSE", "CONSTABLE", "SIR", "LADY", "LORD", "REVEREND", "REV",
]);

/** Prefixes that denote a different casting (a different actor), never merged with the plain name. */
const AGE_PREFIXES = new Set(["YOUNG", "OLD", "OLDER", "LITTLE", "TEEN", "TEENAGE", "ADULT", "BABY", "ELDERLY"]);

export function normalizeCharacterName(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^A-Z0-9 '\-.]/g, " ")
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTitles(name: string): string {
  const tokens = name.split(" ");
  while (tokens.length > 1 && TITLES.has(tokens[0])) tokens.shift();
  return tokens.join(" ");
}

export function resolveCharacters(rawNames: Iterable<string>): Resolution {
  const map = new Map<string, string>();
  const merges: Merge[] = [];
  const ambiguous: Resolution["ambiguous"] = [];

  const normalized = new Map<string, string>(); // normalized → title-stripped
  for (const raw of rawNames) {
    const n = normalizeCharacterName(raw);
    if (n) normalized.set(n, stripTitles(n));
  }

  const fullNames = new Set<string>();
  for (const s of normalized.values()) {
    const tokens = s.split(" ");
    if (tokens.length > 1 && !AGE_PREFIXES.has(tokens[0])) fullNames.add(s);
  }
  // A full name that is a strict subset of a longer full name ("ELI VOSS" ⊂ "HARBOR ELI VOSS") is left alone:
  // only single tokens are folded, to stay conservative.

  for (const [n, stripped] of normalized) {
    let canonical = stripped;
    let rule: Merge["rule"] | undefined = stripped !== n ? "title_stripped" : undefined;
    const tokens = stripped.split(" ");
    if (tokens.length === 1) {
      const candidates = [...fullNames].filter((f) => f.split(" ").includes(stripped));
      if (candidates.length === 1) {
        canonical = candidates[0];
        rule = "unique_token_match";
      } else if (candidates.length > 1) {
        ambiguous.push({ name: n, candidates });
      }
    }
    map.set(n, canonical);
    if (canonical !== n) merges.push({ alias: n, canonical, rule: rule ?? "normalized" });
  }

  return { map, canonicals: [...new Set(map.values())].sort(), merges, ambiguous };
}

const ARTICLES = new Set(["A", "AN", "THE", "HIS", "HER", "THEIR", "MY", "YOUR", "ITS", "OUR", "THIS", "THAT"]);

export function normalizePropName(raw: string): string {
  const tokens = raw
    .toUpperCase()
    .replace(/[^A-Z0-9 '\-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => !ARTICLES.has(t) && !/'S$/.test(t));
  if (tokens.length) {
    const last = tokens[tokens.length - 1];
    if (last.length > 3 && last.endsWith("S") && !last.endsWith("SS")) tokens[tokens.length - 1] = last.slice(0, -1);
  }
  return tokens.join(" ");
}

export function resolveProps(rawNames: Iterable<string>): Resolution {
  const map = new Map<string, string>();
  const merges: Merge[] = [];
  const ambiguous: Resolution["ambiguous"] = [];
  const names = new Set<string>();
  const byRaw = new Map<string, string>();
  for (const raw of rawNames) {
    const n = normalizePropName(raw);
    if (!n) continue;
    names.add(n);
    byRaw.set(raw, n);
  }
  const multi = [...names].filter((n) => n.includes(" "));
  for (const n of names) {
    if (n.includes(" ")) {
      map.set(n, n);
      continue;
    }
    const candidates = multi.filter((m) => m.split(" ").at(-1) === n);
    if (candidates.length === 1) {
      map.set(n, candidates[0]);
      merges.push({ alias: n, canonical: candidates[0], rule: "head_noun_match" });
    } else {
      map.set(n, n);
      if (candidates.length > 1) ambiguous.push({ name: n, candidates });
    }
  }
  return { map, canonicals: [...new Set(map.values())].sort(), merges, ambiguous };
}

export interface SheetLocation {
  name: string;
  aliases: string[];
}

export function normalizeLocationName(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^A-Z0-9 '\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Match script locations to the location sheet by name or alias, also trying
 * the main location before a " - " sub-location ("LIGHTHOUSE - LAMP ROOM").
 */
export function resolveLocations(scriptLocations: Iterable<string>, sheet: SheetLocation[]): Resolution & { unmatched: string[] } {
  const index = new Map<string, string>();
  for (const row of sheet) {
    const canonical = normalizeLocationName(row.name);
    index.set(canonical, canonical);
    for (const a of row.aliases) index.set(normalizeLocationName(a), canonical);
  }
  const map = new Map<string, string>();
  const merges: Merge[] = [];
  const unmatched: string[] = [];
  for (const raw of scriptLocations) {
    const n = normalizeLocationName(raw);
    const main = normalizeLocationName(raw.split(/\s+-\s+/)[0]);
    const hit = index.get(n) ?? index.get(main);
    if (hit) {
      map.set(n, hit);
      if (hit !== n) merges.push({ alias: n, canonical: hit, rule: "location_sheet" });
    } else {
      map.set(n, n);
      unmatched.push(n);
    }
  }
  return { map, canonicals: [...new Set(map.values())].sort(), merges, ambiguous: [], unmatched };
}
