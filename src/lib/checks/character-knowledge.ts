import { nameOf, quote, sceneIndex, type FactInfo, type JudgeCandidate, type JudgedCheck, type SceneInfo } from "./types";

const STOP = new Set([
  "that", "this", "with", "from", "have", "were", "they", "them", "their", "there", "where", "what", "when", "which",
  "will", "would", "about", "into", "been", "before", "after", "knows", "know", "learns", "learned", "tells", "told",
  "says", "said", "does", "dont", "isnt", "it's", "it’s", "hidden", "hide",
]);

export function contentWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z' ]/g, " ")
      .split(/\s+/)
      .map((w) => w.replace(/'s$/, ""))
      .filter((w) => w.length >= 4 && !STOP.has(w)),
  );
}

/**
 * A character references information in a scene before the scene in which
 * they learn it. Candidates pair each reference with every later "learns" fact
 * of the same character that shares a content word; the judge decides whether
 * the reference really depends on that information.
 */
export const characterKnowledge: JudgedCheck = {
  id: "character_knowledge",
  title: "Character knows something before learning it",
  kind: "llm_judge",
  question:
    "Does the earlier line show the character already knowing or acting on the specific information they only learn in the later scene? If they could know it another way, or the earlier line is about something different, it is not a conflict.",
  candidates(state) {
    const scenes = sceneIndex(state);
    type K = { fact: FactInfo; scene: SceneInfo; words: Set<string> };
    const refs: K[] = [];
    const learns: K[] = [];
    for (const f of state.facts) {
      if ((f.kind !== "references_fact" && f.kind !== "learns_fact") || f.sceneId == null || f.subjectEntityId == null) continue;
      const scene = scenes.get(f.sceneId);
      if (!scene || scene.isFlashback) continue;
      (f.kind === "learns_fact" ? learns : refs).push({ fact: f, scene, words: contentWords(f.objectValue) });
    }

    const out: JudgeCandidate[] = [];
    for (const r of refs) {
      for (const l of learns) {
        if (l.fact.subjectEntityId !== r.fact.subjectEntityId || l.scene.ordinal <= r.scene.ordinal) continue;
        if (![...r.words].some((w) => l.words.has(w))) continue;
        const who = nameOf(state, r.fact.subjectEntityId);
        out.push({
          checkId: this.id,
          severity: "high",
          title: `${who} refers to "${r.fact.objectValue}" in scene ${r.scene.number}, before learning it in scene ${l.scene.number}`,
          explanation: `In scene ${r.scene.number}, ${quote(r.fact, r.scene)}. ${who} only learns "${l.fact.objectValue}" later, in scene ${l.scene.number}: ${quote(l.fact, l.scene)}.`,
          evidence: [
            `Character: ${who}`,
            `Earlier, ${quote(r.fact, r.scene)} — refers to: ${r.fact.objectValue}`,
            `Later, ${quote(l.fact, l.scene)} — learns: ${l.fact.objectValue}`,
          ].join("\n"),
          factIds: [r.fact.id, l.fact.id],
          sceneNumbers: [r.scene.number, l.scene.number],
          signatureParts: [who, r.scene.number, l.scene.number, l.fact.objectValue.toLowerCase()],
        });
      }
    }
    return out;
  },
};
