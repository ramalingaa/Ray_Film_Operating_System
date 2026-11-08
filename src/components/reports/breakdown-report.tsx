import { Cite, Section, SeverityBadge, Stat } from "@/components/run-bits";
import { formatEighths } from "@/lib/intake/pages";
import type { BreakdownReport } from "@/lib/stages/breakdown";

const CATEGORY_LABEL: Record<string, string> = {
  extras: "Extras",
  vehicle: "Vehicles",
  animal: "Animals",
  stunt: "Stunts",
  weapon: "Weapons",
  sfx: "Special effects",
  fire: "Fire",
  water: "Water",
  vfx: "VFX",
  makeup: "Special makeup",
  equipment: "Equipment",
  intimacy: "Intimacy",
  minor: "Minors",
};

export function BreakdownReportView({ r }: { r: BreakdownReport }) {
  const high = r.alerts.filter((a) => a.severity === "high").length;
  return (
    <div>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Cast" value={r.cast.length} hint="speaking and silent" />
        <Stat label="Department alerts" value={r.alerts.length} hint={`${high} high`} />
        <Stat label="Tagged elements" value={Object.values(r.counts).reduce((a, b) => a + (b ?? 0), 0)} />
        <Stat label="Pages" value={formatEighths(r.scenes.reduce((n, s) => n + s.eighths, 0))} hint="estimate" />
      </div>
      {!r.modelRead && <p className="mb-4 text-sm text-amber-700 dark:text-amber-400">No model read the scenes, so only cast (from dialogue), stated ages and scene headings are broken down.</p>}

      <Section title="Department alerts" note="Who has to act, on which scenes, and what they usually need.">
        {r.alerts.length === 0 ? (
          <p className="text-sm text-zinc-500">No department alerts.</p>
        ) : (
          <ul className="space-y-4">
            {r.alerts.map((a, i) => (
              <li key={i} className="text-sm">
                <div className="flex flex-wrap items-baseline gap-2">
                  <SeverityBadge severity={a.severity} />
                  <span className="font-medium">{a.title}</span>
                  <span className="text-zinc-500">→ {a.department}</span>
                  <span className="text-zinc-500">· scene{a.scenes.length > 1 ? "s" : ""} {a.scenes.join(", ")}</span>
                </div>
                <p className="mt-0.5 text-zinc-600 dark:text-zinc-400">{a.needs}</p>
                <p className="text-zinc-600 dark:text-zinc-400">Items: {a.items.join("; ")}</p>
                {a.cites.map((c, j) => (
                  <div key={j}>
                    <Cite line={c.line} snippet={c.snippet} scene={c.sceneNumber} />
                  </div>
                ))}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Cast" note="Scenes and estimated pages per character.">
        <table className="w-full text-sm">
          <tbody>
            {r.cast.map((c) => (
              <tr key={c.name} className="border-t border-zinc-200 dark:border-zinc-800">
                <td className="py-1 pr-3 font-medium">{c.name}</td>
                <td className="py-1 pr-3 text-zinc-500">scenes {c.scenes.join(", ")}</td>
                <td className="py-1 text-right tabular-nums">{formatEighths(c.eighths)} pp</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Scene by scene">
        <div className="space-y-3">
          {r.scenes.map((s) => (
            <article key={s.number} className="rounded border border-zinc-200 p-3 text-sm dark:border-zinc-800">
              <header className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-mono text-xs">
                  {s.number}. {s.heading}
                </span>
                <span className="text-xs text-zinc-500">
                  {s.pages} pp{s.storyDay != null ? ` · story day ${s.storyDay}` : ""}
                </span>
              </header>
              <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[7rem_1fr]">
                <dt className="text-zinc-500">Cast</dt>
                <dd>{s.cast.join(", ") || "—"}</dd>
                {s.wardrobe.length > 0 && (
                  <>
                    <dt className="text-zinc-500">Wardrobe</dt>
                    <dd>{s.wardrobe.map((w) => `${w.character}: ${w.garment}`).join("; ")}</dd>
                  </>
                )}
                {s.props.length > 0 && (
                  <>
                    <dt className="text-zinc-500">Props</dt>
                    <dd>{s.props.join(", ")}</dd>
                  </>
                )}
                {s.elements.map((e, i) => (
                  <div key={i} className="contents">
                    <dt className="text-zinc-500">{CATEGORY_LABEL[e.category] ?? e.category}</dt>
                    <dd>
                      {e.item}
                      {e.detail ? ` (${e.detail})` : ""}{" "}
                      <span className="font-mono text-xs text-zinc-500">line {e.cite.line}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            </article>
          ))}
        </div>
      </Section>
    </div>
  );
}
