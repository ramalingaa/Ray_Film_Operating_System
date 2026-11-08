import { Cite, Section, SeverityBadge } from "@/components/run-bits";
import type { Skipped, StoryReport } from "@/lib/stages/story";
import { pct } from "@/lib/story/beats";

const TIMING_TONE = {
  on_time: "text-emerald-700 dark:text-emerald-400",
  early: "text-amber-700 dark:text-amber-400",
  late: "text-amber-700 dark:text-amber-400",
  missing: "text-red-700 dark:text-red-400",
} as const;

const TIMING_LABEL = { on_time: "on time", early: "early", late: "late", missing: "missing" } as const;

export function StoryReportView({ r }: { r: StoryReport | Skipped }) {
  if ("skipped" in r) return <p className="text-sm text-zinc-500">Skipped: {r.skipped}</p>;
  const l = r.logline;
  return (
    <div>
      <Section title="Logline, as the script reads" note={`Read by ${r.model}${r.cacheHit ? " (cached)" : ""}.`}>
        <p className="mb-3 text-lg leading-snug">{l.one_sentence}</p>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {(
            [
              ["Protagonist", l.protagonist],
              ["Goal", l.goal],
              ["Stakes", l.stakes],
              ["Obstacle", l.obstacle],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <dt className="w-24 shrink-0 text-zinc-500">{k}</dt>
              <dd className={v ? "" : "text-red-700 dark:text-red-400"}>{v ?? "not clear from the script"}</dd>
            </div>
          ))}
        </dl>
        {l.cite && (
          <div className="mt-2">
            <Cite line={l.cite.line} snippet={l.cite.snippet} scene={l.cite.sceneNumber} />
          </div>
        )}
      </Section>

      <Section
        title={`What needs attention (${r.issues.length})`}
        note={r.shortForm ? "This is short-form: the 15-beat timings are a reference, not a requirement, so beat findings are marked low." : undefined}
      >
        {r.issues.length === 0 ? (
          <p className="text-sm text-zinc-500">Nothing flagged.</p>
        ) : (
          <ul className="space-y-3">
            {r.issues.map((i, k) => (
              <li key={k} className="text-sm">
                <div className="flex items-start gap-2">
                  <SeverityBadge severity={i.severity} />
                  <span className="font-medium">{i.title}</span>
                </div>
                <p className="mt-0.5 ml-1 text-zinc-600 dark:text-zinc-400">{i.detail}</p>
                {i.cites.map((c, j) => (
                  <div key={j} className="ml-1">
                    <Cite line={c.line} snippet={c.snippet} scene={c.sceneNumber} />
                  </div>
                ))}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Beat sheet" note="Where each beat lands, as a share of the script from the first scene. Expected ranges are generous on purpose.">
        <div className="relative mb-4 h-8 rounded bg-zinc-100 dark:bg-zinc-900" aria-hidden>
          {r.beats
            .filter((b) => b.position != null)
            .map((b) => (
              <span
                key={b.id}
                title={`${b.title}: scene ${b.scene}, ${pct(b.position!)}`}
                className={`absolute top-1 h-6 w-1 rounded ${b.timing === "on_time" ? "bg-emerald-500" : "bg-amber-500"}`}
                style={{ left: `calc(${b.position! * 100}% - 2px)` }}
              />
            ))}
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-zinc-500">
            <tr>
              <th className="py-1 pr-2 font-medium">Beat</th>
              <th className="py-1 pr-2 font-medium">Scene</th>
              <th className="py-1 pr-2 font-medium">Lands at</th>
              <th className="py-1 pr-2 font-medium">Usually</th>
              <th className="py-1 font-medium">How</th>
            </tr>
          </thead>
          <tbody>
            {r.beats.map((b) => (
              <tr key={b.id} className="border-t border-zinc-200 align-top dark:border-zinc-800">
                <td className="py-1.5 pr-2 font-medium">{b.title}</td>
                <td className="py-1.5 pr-2 tabular-nums">{b.scene ?? "—"}</td>
                <td className={`py-1.5 pr-2 tabular-nums ${TIMING_TONE[b.timing]}`}>
                  {b.position != null ? pct(b.position) : ""} {TIMING_LABEL[b.timing]}
                </td>
                <td className="py-1.5 pr-2 text-zinc-500 tabular-nums">{b.expected}</td>
                <td className="py-1.5 text-zinc-600 dark:text-zinc-400">
                  {b.note}
                  {b.cite && (
                    <div>
                      <Cite line={b.cite.line} snippet={b.cite.snippet} />
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Scene cards" note="What each scene is for, and whether the situation changes from its start to its end.">
        <div className="grid gap-3 md:grid-cols-2">
          {r.scenes.map((s) => (
            <article key={s.number} className={`rounded border p-3 text-sm ${s.turns ? "border-zinc-200 dark:border-zinc-800" : "border-amber-300 dark:border-amber-800"}`}>
              <header className="mb-1 flex items-baseline justify-between gap-2">
                <span className="font-mono text-xs">
                  {s.number}. {s.heading}
                </span>
                <span className={`text-xs ${s.turns ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}`}>{s.turns ? "turns" : "does not turn"}</span>
              </header>
              <p className="mb-1">{s.purpose}</p>
              {s.conflict && <p className="text-zinc-600 dark:text-zinc-400">Conflict: {s.conflict}</p>}
              <p className="text-zinc-600 dark:text-zinc-400">
                {s.start} → {s.end}
              </p>
            </article>
          ))}
        </div>
      </Section>

      {r.setups.length > 0 && (
        <Section title="Setups and payoffs">
          <ul className="space-y-1 text-sm">
            {r.setups.map((x, i) => (
              <li key={i}>
                <span className={x.payoffScene ? "" : "text-red-700 dark:text-red-400"}>
                  {x.description}: set up in scene {x.setupScene}, {x.payoffScene ? `paid off in scene ${x.payoffScene}` : "never paid off"}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {r.dropped.length > 0 && (
        <details className="text-xs text-zinc-500">
          <summary className="cursor-pointer">{r.dropped.length} item(s) dropped because their citation could not be verified</summary>
          <ul className="mt-1 list-disc pl-5">
            {r.dropped.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
