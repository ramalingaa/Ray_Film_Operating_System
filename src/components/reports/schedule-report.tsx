import { Cite, Section, SeverityBadge, Stat } from "@/components/run-bits";
import type { ScheduleReport } from "@/lib/stages/schedule";

export function ScheduleReportView({ r }: { r: ScheduleReport }) {
  const dayNumbers = r.days.map((d) => d.day);
  return (
    <div>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Shoot days" value={r.totals.shootDays} hint={`${r.totals.dayDays} day · ${r.totals.nightDays} night`} />
        <Stat label="Company moves" value={r.totals.companyMoves} hint="within shoot days" />
        <Stat label="Cast on the board" value={r.dood.length} />
        <Stat label="Checks" value={r.checks.length} hint={`${r.checks.filter((c) => c.severity === "high").length} high`} />
      </div>

      <Section title={`Checks (${r.checks.length})`}>
        {r.checks.length === 0 ? (
          <p className="text-sm text-muted">Nothing flagged.</p>
        ) : (
          <ul className="space-y-3">
            {r.checks.map((c, i) => (
              <li key={i} className="text-sm">
                <div className="flex items-baseline gap-2">
                  <SeverityBadge severity={c.severity} />
                  <span className="font-medium">{c.title}</span>
                </div>
                <p className="text-fg-2 dark:text-muted">{c.detail}</p>
                {c.cites.map((x, j) => (
                  <div key={j}>
                    <Cite line={x.line} snippet={x.snippet} scene={x.sceneNumber} />
                  </div>
                ))}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Stripboard (draft)" note="One block per shoot day. Day work first, then night work, grouped by set.">
        <div className="space-y-3">
          {r.days.map((d) => (
            <div key={d.day} className="overflow-hidden rounded border border-line dark:border-zinc-800">
              <div className={`flex justify-between px-3 py-1.5 text-xs font-medium ${d.light === "night" ? "bg-indigo-900 text-indigo-100" : "bg-amber-soft text-amber dark:bg-amber-950 dark:text-amber-200"}`}>
                <span>
                  Day {d.day} · {d.light}
                </span>
                <span>
                  {d.pages} pp · {d.sets.join(" → ")}
                </span>
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {d.strips.map((s) => (
                    <tr key={s.scene} className="border-t border-line-2 dark:border-zinc-900">
                      <td className="w-10 px-3 py-1 tabular-nums">{s.scene}</td>
                      <td className="py-1 pr-2 font-mono text-xs">{s.heading}</td>
                      <td className="py-1 pr-2 text-muted">{s.cast.join(", ")}</td>
                      <td className="w-16 py-1 pr-3 text-right tabular-nums">{s.pages}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Day out of days" note="W = works, H = paid hold between first and last work day.">
        <div className="overflow-x-auto">
          <table className="text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="py-1 pr-3 text-left font-medium">Cast</th>
                {dayNumbers.map((n) => (
                  <th key={n} className="w-8 py-1 text-center font-medium tabular-nums">
                    {n}
                  </th>
                ))}
                <th className="py-1 pl-3 text-right font-medium">Work</th>
                <th className="py-1 pl-3 text-right font-medium">Hold</th>
              </tr>
            </thead>
            <tbody>
              {r.dood.map((c) => (
                <tr key={c.name} className="border-t border-line dark:border-zinc-800">
                  <td className="py-1 pr-3 whitespace-nowrap">{c.name}</td>
                  {dayNumbers.map((n) => (
                    <td key={n} className="text-center font-mono text-xs">
                      {c.workDays.includes(n) ? <span className="text-ok dark:text-emerald-400">W</span> : c.holdDays.includes(n) ? <span className="text-amber dark:text-amber-400">H</span> : ""}
                    </td>
                  ))}
                  <td className="pl-3 text-right tabular-nums">{c.workDays.length}</td>
                  <td className="pl-3 text-right tabular-nums">{c.holdDays.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Assumptions">
        <ul className="list-disc space-y-1 pl-5 text-sm text-fg-2 dark:text-muted">
          {r.assumptions.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
