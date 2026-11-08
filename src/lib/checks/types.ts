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

export interface DeterministicCheck {
  id: string;
  title: string;
  kind: "deterministic";
  run(state: BibleState): FindingDraft[];
}

/** A possible conflict picked out by code, to be confirmed or rejected by a judge model. */
export interface JudgeCandidate extends FindingDraft {
  /** The evidence the judge sees: both sides, quoted, with scene numbers and lines. */
  evidence: string;
}

/**
 * Checks that need judgment. Code generates candidates (pure); the judge agent
 * decides each one. `deterministic` covers the part code can decide alone.
 */
export interface JudgedCheck {
  id: string;
  title: string;
  kind: "llm_judge";
  /** What the judge is asked to decide, in plain language. */
  question: string;
  deterministic?(state: BibleState): FindingDraft[];
  candidates(state: BibleState): JudgeCandidate[];
}

export type Check = DeterministicCheck | JudgedCheck;

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

/** `scene 4, line 52: "his suit jacket immaculate"` */
export function quote(f: FactInfo, scene: Pick<SceneInfo, "number">): string {
  return `scene ${scene.number}, line ${f.sourceLine}: "${f.sourceSnippet}"`;
}
