import { Cite, Section, SeverityBadge, Stat } from "@/components/run-bits";
import { formatEighths } from "@/lib/intake/pages";
import type { LocationsReport } from "@/lib/stages/locations";
import { SetBars } from "@/components/visuals/production-charts";

export function LocationsReportView({ r }: { r: LocationsReport }) {
  const sp = r.split;
  return (
    <div>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Sets" value={r.sets.length} hint="each one is a company move" />
        <Stat label="Interior / exterior" value={`${formatEighths(sp.intEighths)} / ${formatEighths(sp.extEighths)}`} hint="pages" />
        <Stat label="Day / night" value={`${formatEighths(sp.dayEighths)} / ${formatEighths(sp.nightEighths)}`} hint="pages" />
        <Stat label="On the location sheet" value={r.sheetGiven ? `${r.sets.filter((s) => s.onSheet).length} of ${r.sets.length}` : "no sheet"} />
      </div>

      <Section title="Pages per set" note="Largest first, split by day and night.">
        <SetBars
          sets={r.sets.map((s) => ({
            name: s.name,
            day: s.dayEighths ?? (s.times.some((t) => /NIGHT/i.test(t)) ? 0 : s.eighths),
            night: s.nightEighths ?? (s.times.some((t) => /NIGHT/i.test(t)) ? s.eighths : 0),
          }))}
        />
      </Section>

      <Section title={`Flags (${r.flags.length})`}>
        {r.flags.length === 0 ? (
          <p className="text-sm text-muted">Nothing flagged.</p>
        ) : (
          <ul className="space-y-3">
            {r.flags.map((f, i) => (
              <li key={i} className="text-sm">
                <div className="flex items-baseline gap-2">
                  <SeverityBadge severity={f.severity} />
                  <span className="font-medium">{f.title}</span>
                </div>
                <p className="text-fg-2 dark:text-muted">{f.detail}</p>
                {f.cites.map((c, j) => (
                  <Cite key={j} line={c.line} snippet={c.snippet} scene={c.sceneNumber} />
                ))}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Sets" note="Largest first. Pages are estimates.">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted">
            <tr>
              <th className="py-1 pr-2 font-medium">Set</th>
              <th className="py-1 pr-2 font-medium">Int/Ext</th>
              <th className="py-1 pr-2 font-medium">Times</th>
              <th className="py-1 pr-2 font-medium">Scenes</th>
              <th className="py-1 pr-2 text-right font-medium">Pages</th>
              <th className="py-1 font-medium">Sheet</th>
            </tr>
          </thead>
          <tbody>
            {r.sets.map((s) => (
              <tr key={s.name + s.firstCite.line} className="border-t border-line align-top dark:border-zinc-800">
                <td className="py-1.5 pr-2 font-medium">{s.name}</td>
                <td className="py-1.5 pr-2">{s.intExt.join(", ")}</td>
                <td className="py-1.5 pr-2">{s.times.join(", ")}</td>
                <td className="py-1.5 pr-2 text-muted">{s.scenes.join(", ")}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{s.pages}</td>
                <td className="py-1.5">
                  {s.onSheet == null ? "—" : s.onSheet ? <span title={s.sheetCite ? `${s.sheetCite.docName} line ${s.sheetCite.line}` : ""}>yes</span> : <span className="text-rose dark:text-red-400">missing</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}
