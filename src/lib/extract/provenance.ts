/**
 * Anti-hallucination guard: a model-reported source pointer is accepted only
 * if its snippet really occurs in the scene. A pointer to the wrong line is
 * corrected to the line where the snippet actually is.
 */

export const MAX_SNIPPET_WORDS = 25;

export function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[^a-z0-9'\- ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function truncateWords(s: string, max = MAX_SNIPPET_WORDS): string {
  const words = s.trim().split(/\s+/);
  return words.length <= max ? s.trim() : words.slice(0, max).join(" ");
}

export interface SceneLines {
  startLine: number;
  text: string;
}

export type SourceCheck =
  | { ok: true; line: number; snippet: string; corrected: boolean }
  | { ok: false; reason: string };

/** Pieces of a snippet that a model elided with "..." must all be present. */
function containsAll(haystack: string, parts: string[]): boolean {
  return parts.every((p) => haystack.includes(p));
}

export function verifySource(scene: SceneLines, line: number, snippet: string): SourceCheck {
  const parts = snippet
    .split(/\.{3}|…/)
    .map(normalizeForMatch)
    .filter((p) => p.length > 0);
  if (parts.length === 0) return { ok: false, reason: "empty snippet" };

  const lines = scene.text.split("\n").map(normalizeForMatch);
  const endLine = scene.startLine + lines.length - 1;
  const clean = truncateWords(snippet.replace(/\s+/g, " "));

  if (line >= scene.startLine && line <= endLine && containsAll(lines[line - scene.startLine], parts)) {
    return { ok: true, line, snippet: clean, corrected: false };
  }
  const idx = lines.findIndex((l) => containsAll(l, parts));
  if (idx >= 0) return { ok: true, line: scene.startLine + idx, snippet: clean, corrected: true };

  // Snippet wrapped across adjacent lines.
  for (let i = 0; i < lines.length - 1; i++) {
    if (containsAll(`${lines[i]} ${lines[i + 1]}`, parts)) {
      return { ok: true, line: scene.startLine + i, snippet: clean, corrected: i + scene.startLine !== line };
    }
  }
  return { ok: false, reason: `snippet not found in scene: "${truncateWords(snippet, 12)}"` };
}
