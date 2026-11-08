/**
 * Decide what the user gave us. Pure code: a screenplay has Fountain scene
 * headings; anything else (prose story, treatment, logline) is a story.
 */
import { parseFountain, type ParsedScript } from "../fountain";
import { fdxToFountain, isFdx } from "./fdx";

export type InputKind = "screenplay" | "story";

export interface Classified {
  kind: InputKind;
  /** Fountain text when kind = screenplay (FDX converted); the raw text for a story. */
  text: string;
  format: "fountain" | "fdx" | "prose";
  reason: string;
  parsed?: ParsedScript;
  words: number;
}

export function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export function classifyInput(raw: string, fileName = ""): Classified {
  const text = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  if (isFdx(text) || /\.fdx$/i.test(fileName)) {
    const fountain = fdxToFountain(text).text;
    return { kind: "screenplay", text: fountain, format: "fdx", reason: "Final Draft file", parsed: parseFountain(fountain), words: wordCount(fountain) };
  }
  const parsed = parseFountain(text);
  const dialogue = parsed.scenes.some((s) => s.elements.some((e) => e.type === "dialogue"));
  if (parsed.scenes.length >= 2 || (parsed.scenes.length === 1 && dialogue)) {
    return {
      kind: "screenplay",
      text,
      format: "fountain",
      reason: `${parsed.scenes.length} scene heading${parsed.scenes.length === 1 ? "" : "s"} found`,
      parsed,
      words: wordCount(text),
    };
  }
  return { kind: "story", text, format: "prose", reason: "no screenplay scene headings found, so it is read as a story", words: wordCount(text) };
}
