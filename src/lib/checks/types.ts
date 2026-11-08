export type Severity = "high" | "medium" | "low";

export interface SceneInfo {
  id: number;
  ordinal: number;
  number: string;
  heading: string;
  timeOfDay: string;
  isFlashback: boolean;
  storyDay: number | null;
  /** How the story day was established: explicit, continuity, model_relation, assumed, flashback, unknown. */
  dayBasis: string;
  locationEntityId: number | null;
  startLine: number;
}

export interface FactInfo {
  id: number;
  sceneId: number | null;
  kind: string;
  subjectEntityId: number | null;
  predicate: string;
  objectValue: string;
  attrs: Record<string, unknown>;
  storyDay: number | null;
  sourceDocId: number;
  sourceDocName: string;
  sourceLine: number;
  sourceSnippet: string;
  confidence: number;
  extractedBy: string;
}

/** Everything a check may look at. Checks are pure functions of this snapshot. */
export interface BibleState {
  docId: number;
  /** Sorted by ordinal. */
  scenes: SceneInfo[];
  facts: FactInfo[];
  entityNames: Map<number, string>;
}

export interface FindingDraft {
  checkId: string;
  severity: Severity;
  title: string;
  /** Plain language. Describe the conflict; never tell the writer they are wrong. */
  explanation: string;
  factIds: number[];
  sceneNumbers: string[];
  /** Stable identity across re-runs (names, scene numbers, values; never row ids). */
  signatureParts: string[];
}

export interface Check {
  id: string;
  title: string;
  kind: "deterministic" | "llm_judge";
  run(state: BibleState): FindingDraft[];
}

// ---- small helpers shared by checks ------------------------------------------

export function sceneIndex(state: BibleState): Map<number, SceneInfo> {
  return new Map(state.scenes.map((s) => [s.id, s]));
}

export function nameOf(state: BibleState, id: number | null): string {
  return id == null ? "?" : (state.entityNames.get(id) ?? `entity ${id}`);
}

export function cite(f: FactInfo): string {
  return `${f.sourceDocName} line ${f.sourceLine}`;
}
