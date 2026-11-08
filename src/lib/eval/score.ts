/**
 * Score check findings against the seeded-error manifest.
 *
 * A finding matches a planted error when the check is the error's check_id
 * (or one of its also_checks) and their scene sets overlap. Matching is
 * one-to-one and greedy: largest scene overlap first, required checks before
 * optional ones. Only errors whose check is implemented count toward recall.
 */
import { parse } from "yaml";
import { z } from "zod";

export const SeededErrorSchema = z.object({
  id: z.string(),
  check_id: z.string(),
  also_checks: z.array(z.string()).optional(),
  scenes: z.array(z.coerce.string()).min(1),
  description: z.string(),
});
export const ManifestSchema = z.object({ errors: z.array(SeededErrorSchema).min(1) });

export type SeededError = z.infer<typeof SeededErrorSchema>;

export function parseManifest(yamlText: string): SeededError[] {
  const parsed = ManifestSchema.parse(parse(yamlText));
  const ids = new Set<string>();
  for (const e of parsed.errors) {
    if (ids.has(e.id)) throw new Error(`duplicate error id ${e.id} in manifest`);
    ids.add(e.id);
  }
  return parsed.errors;
}

export interface ScoredFinding {
  checkId: string;
  sceneNumbers: string[];
  title: string;
}

export interface CheckScore {
  tp: number;
  fp: number;
  fn: number;
  precision: number | null;
  recall: number | null;
}

export interface Match {
  finding: ScoredFinding;
  errorId: string;
  required: boolean;
}

export interface ScoreResult {
  checksInScope: string[];
  tp: number;
  fp: number;
  fn: number;
  precision: number | null;
  recall: number | null;
  perCheck: Record<string, CheckScore>;
  matches: Match[];
  missed: SeededError[];
  falseAlarms: ScoredFinding[];
  /** Planted errors whose check is not implemented yet. */
  outOfScope: SeededError[];
}

const ratio = (a: number, b: number) => (b === 0 ? null : a / b);

export function score(findings: ScoredFinding[], errors: SeededError[], checksInScope: string[]): ScoreResult {
  const scope = new Set(checksInScope);
  const inScope = errors.filter((e) => scope.has(e.check_id));
  const outOfScope = errors.filter((e) => !scope.has(e.check_id));
  const relevant = findings.filter((f) => scope.has(f.checkId));

  type Candidate = { fi: number; error: SeededError; check: string; required: boolean; overlap: number };
  const candidates: Candidate[] = [];
  relevant.forEach((f, fi) => {
    for (const error of errors) {
      const checks = [error.check_id, ...(error.also_checks ?? [])];
      if (!checks.includes(f.checkId)) continue;
      const overlap = f.sceneNumbers.filter((s) => error.scenes.includes(s)).length;
      if (overlap > 0) candidates.push({ fi, error, check: f.checkId, required: f.checkId === error.check_id && scope.has(error.check_id), overlap });
    }
  });
  candidates.sort((a, b) => b.overlap - a.overlap || Number(b.required) - Number(a.required));

  const usedFindings = new Set<number>();
  const usedUnits = new Set<string>();
  const matches: Match[] = [];
  for (const c of candidates) {
    const unit = `${c.error.id}\u0000${c.check}`;
    if (usedFindings.has(c.fi) || usedUnits.has(unit)) continue;
    usedFindings.add(c.fi);
    usedUnits.add(unit);
    matches.push({ finding: relevant[c.fi], errorId: c.error.id, required: c.required });
  }

  const caught = new Set(matches.filter((m) => m.required).map((m) => m.errorId));
  const missed = inScope.filter((e) => !caught.has(e.id));
  const falseAlarms = relevant.filter((_, i) => !usedFindings.has(i));

  const perCheck: Record<string, CheckScore> = {};
  for (const check of checksInScope) {
    const tp = matches.filter((m) => m.finding.checkId === check).length;
    const fp = falseAlarms.filter((f) => f.checkId === check).length;
    const required = inScope.filter((e) => e.check_id === check);
    const fn = required.filter((e) => !caught.has(e.id)).length;
    perCheck[check] = { tp, fp, fn, precision: ratio(tp, tp + fp), recall: ratio(required.length - fn, required.length) };
  }

  const tp = matches.length;
  const fp = falseAlarms.length;
  return {
    checksInScope,
    tp,
    fp,
    fn: missed.length,
    precision: ratio(tp, tp + fp),
    recall: ratio(inScope.length - missed.length, inScope.length),
    perCheck,
    matches,
    missed,
    falseAlarms,
    outOfScope,
  };
}
