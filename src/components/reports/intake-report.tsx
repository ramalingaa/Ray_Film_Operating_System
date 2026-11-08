import { Section, Stat } from "@/components/run-bits";
import type { IntakeReport } from "@/lib/stages/intake";

export function IntakeReportView({ r, scriptText }: { r: IntakeReport; scriptText: string | null }) {
  return (
    <div>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Input" value={r.kind === "story" ? "Story" : "Screenplay"} hint={r.format === "fdx" ? "Final Draft" : r.format === "fountain" ? "Fountain" : "prose"} />
        <Stat label="Scenes" value={r.scenes.length} />
        <Stat label="Length (estimate)" value={`${r.totalPages} pp`} hint="about 55 lines per page" />
        <Stat label="Running time (estimate)" value={`~${r.runtimeMinutes} min`} hint="one page ≈ one minute" />
      </div>
      <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
        Read as a {r.kind}: {r.reason}. {r.words.toLocaleString()} words.
      </p>

      {r.generated && (
        <p className="mb-6 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          The scenes below were generated from your story by {r.adaptation?.model ?? "a model"}. Later stages analyze this outline, so check it against
          your story; every finding still cites the outline line it comes from.
        </p>
      )}

      {r.warnings.length > 0 && (
        <Section title="Things to fix before scheduling">
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {r.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Scenes" note="Page lengths are estimates in eighths of a page, the unit schedules use.">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-zinc-500">
            <tr>
              <th className="py-1 pr-2 font-medium">#</th>
              <th className="py-1 pr-2 font-medium">Heading</th>
              <th className="py-1 pr-2 text-right font-medium">Pages</th>
              <th className="py-1 text-right font-medium">Line</th>
            </tr>
          </thead>
          <tbody>
            {r.scenes.map((s) => (
              <tr key={`${s.number}-${s.startLine}`} className="border-t border-zinc-200 dark:border-zinc-800">
                <td className="py-1 pr-2 tabular-nums">{s.number}</td>
                <td className="py-1 pr-2 font-mono text-xs">
                  {s.heading}
                  {s.flashback && <span className="ml-2 text-zinc-500">(flashback)</span>}
                </td>
                <td className="py-1 pr-2 text-right tabular-nums">{s.pages}</td>
                <td className="py-1 text-right text-zinc-500 tabular-nums">{s.startLine}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {r.generated && scriptText && (
        <details className="text-sm">
          <summary className="cursor-pointer text-zinc-600 dark:text-zinc-400">Show the generated outline (Fountain)</summary>
          <pre className="mt-2 max-h-[32rem] overflow-auto rounded bg-zinc-50 p-3 font-mono text-xs whitespace-pre-wrap dark:bg-zinc-900">{scriptText}</pre>
        </details>
      )}
    </div>
  );
}
