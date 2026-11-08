import { ScriptReview } from "@/components/script-review";
import { Stat } from "@/components/run-bits";
import { getCheck } from "@/lib/checks";
import type { ReviewData } from "@/lib/ui/queries";
import type { ContinuityReport } from "@/lib/stages/continuity";

export function ContinuityReportView({ r, review }: { r: ContinuityReport; review?: ReviewData }) {
  const checks = Object.entries(r.findings.byCheck).sort((a, b) => b[1] - a[1]);
  return (
    <div className="flex min-h-0 flex-col">
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Open conflicts" value={r.findings.open} hint={`${r.findings.total} found in total`} />
        <Stat label="High / medium / low" value={`${r.findings.bySeverity.high} / ${r.findings.bySeverity.medium} / ${r.findings.bySeverity.low}`} />
        <Stat label="Scenes read by the model" value={r.extraction.model ? `${r.extraction.extracted} of ${r.sceneCount}` : "none"} hint={r.extraction.model ? `${r.extraction.cached} from cache` : "no model configured"} />
        <Stat label="Possible conflicts judged" value={r.judge.candidates} hint={`${r.judge.accepted} confirmed, ${r.judge.rejected} rejected`} />
      </div>
      {r.extraction.dropped > 0 && <p className="mb-2 text-xs text-zinc-500">{r.extraction.dropped} extracted item(s) were dropped because their quoted line could not be found in the scene.</p>}
      {r.failedChecks.map((f) => (
        <p key={f.id} className="mb-2 text-sm text-red-700 dark:text-red-400">
          Check {getCheck(f.id)?.title ?? f.id} failed: {f.error}
        </p>
      ))}
      {checks.length > 0 && (
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
          By check: {checks.map(([id, n]) => `${getCheck(id)?.title ?? id} ${n}`).join(" · ")}
        </p>
      )}
      {review ? (
        <div className="flex h-[70vh] min-h-0 flex-col overflow-hidden rounded border border-zinc-200 dark:border-zinc-800">
          <ScriptReview scenes={review.scenes} findings={review.findings} />
        </div>
      ) : (
        <p className="text-sm text-zinc-500">The script for this run is no longer stored.</p>
      )}
    </div>
  );
}
