/**
 * Charts for the screenplay and production stages, plain HTML/SVG:
 * scene timeline, who-is-in-which-scene grid, breakdown heat map, pages per
 * set (day/night), shoot-day strips, and budget bars. Every mark has a hover
 * title; identity never rests on colour alone.
 */
import { formatEighths } from "@/lib/intake/pages";
import { categoryColors, MUTED, OTHER, rampColor, SERIES, TEXT_2 } from "./palette";

function Legend({ items }: { items: [string, string][] }) {
  return (
    <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[13px] text-fg-2">
      {items.map(([label, color]) => (
        <span key={label} className="inline-flex items-center gap-2">
          <span className="h-3 w-3 rounded-[3px]" style={{ background: color }} />
          {label}
        </span>
      ))}
    </div>
  );
}

// ---- screenplay ----------------------------------------------------------------------

export interface TimelineScene {
  number: string;
  heading: string;
  eighths: number;
  night: boolean;
  exterior: boolean;
}

/** Scenes in order, width by page length; night scenes dark with a moon label, exteriors marked. */
export function SceneTimeline({ scenes }: { scenes: TimelineScene[] }) {
  const total = scenes.reduce((n, s) => n + s.eighths, 0) || 1;
  return (
    <figure className="m-0">
      <Legend
        items={[
          ["day", SERIES[3]],
          ["night", SERIES[6]],
        ]}
      />
      <div className="flex h-16 w-full gap-0.5 overflow-hidden rounded-xl" role="img" aria-label={`${scenes.length} scenes in order, sized by page length`}>
        {scenes.map((s) => (
          <div
            key={s.number}
            title={`Scene ${s.number}: ${s.heading} · ${formatEighths(s.eighths)} pages`}
            className="flex min-w-6 flex-col items-center justify-center text-xs font-bold text-white"
            style={{ flexGrow: s.eighths, flexBasis: 0, background: s.night ? SERIES[6] : SERIES[3] }}
          >
            <span>{s.number}</span>
            <span className="text-[10px] font-semibold opacity-90">{s.exterior ? "EXT" : "INT"}</span>
          </div>
        ))}
      </div>
      <figcaption className="mt-2 flex justify-between text-xs" style={{ color: MUTED }}>
        <span>scene 1</span>
        <span>{formatEighths(total)} pages in all</span>
      </figcaption>
    </figure>
  );
}

/** Rows: characters. Columns: scenes. A dot where the character is in the scene. */
export function PresenceGrid({ scenes, rows }: { scenes: string[]; rows: { name: string; in: Set<string> }[] }) {
  if (!rows.length) return null;
  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-0 text-sm" aria-label="Which character is in which scene">
        <thead>
          <tr>
            <th className="sticky left-0 bg-card pr-4 text-left text-xs font-semibold tracking-wider text-muted">CHARACTER</th>
            {scenes.map((n) => (
              <th key={n} className="w-9 pb-2 text-center text-xs font-semibold text-muted">
                {n}
              </th>
            ))}
            <th className="pl-3 text-right text-xs font-semibold text-muted">SCENES</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td className="sticky left-0 bg-card py-1.5 pr-4 font-semibold whitespace-nowrap">{r.name}</td>
              {scenes.map((n) => (
                <td key={n} className="border-l border-line-2 text-center" title={`${r.name} ${r.in.has(n) ? "is" : "is not"} in scene ${n}`}>
                  {r.in.has(n) ? <span className="inline-block h-3.5 w-3.5 rounded-full align-middle" style={{ background: SERIES[0] }} /> : null}
                </td>
              ))}
              <td className="pl-3 text-right tabular-nums" style={{ color: TEXT_2 }}>
                {r.in.size}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---- breakdown -------------------------------------------------------------------------

/** Scenes × department categories, cell shade = number of tagged items. */
export function BreakdownHeatmap({ scenes, categories }: { scenes: { number: string; counts: Record<string, number> }[]; categories: { id: string; label: string }[] }) {
  const used = categories.filter((c) => scenes.some((s) => (s.counts[c.id] ?? 0) > 0));
  if (!used.length) return null;
  const max = Math.max(...scenes.flatMap((s) => used.map((c) => s.counts[c.id] ?? 0)));
  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-0.5 text-sm" aria-label="Department needs by scene">
        <thead>
          <tr>
            <th className="pr-3 text-left text-xs font-semibold tracking-wider text-muted">SCENE</th>
            {used.map((c) => (
              <th key={c.id} className="px-1 pb-1 text-center text-xs font-semibold text-muted">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {scenes.map((s) => (
            <tr key={s.number}>
              <td className="pr-3 font-semibold">{s.number}</td>
              {used.map((c) => {
                const v = s.counts[c.id] ?? 0;
                return (
                  <td
                    key={c.id}
                    title={`Scene ${s.number} · ${c.label}: ${v}`}
                    className="h-9 min-w-16 rounded-md text-center text-xs font-bold"
                    style={{ background: v ? rampColor(v, max) : "#F1ECE0", color: v ? "#fff" : "transparent" }}
                  >
                    {v || ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---- places ------------------------------------------------------------------------------

/** Pages per set, split day/night, largest first. */
export function SetBars({ sets }: { sets: { name: string; day: number; night: number }[] }) {
  const max = Math.max(1, ...sets.map((s) => s.day + s.night));
  return (
    <figure className="m-0">
      <Legend
        items={[
          ["day", SERIES[3]],
          ["night", SERIES[6]],
        ]}
      />
      <ul className="flex flex-col gap-2.5">
        {sets.map((s) => (
          <li key={s.name} className="grid grid-cols-[minmax(120px,200px)_1fr_auto] items-center gap-3 text-sm">
            <span className="truncate font-semibold" title={s.name}>
              {s.name}
            </span>
            <span className="flex h-5 gap-0.5" role="img" aria-label={`${s.name}: ${formatEighths(s.day)} day pages, ${formatEighths(s.night)} night pages`}>
              {s.day > 0 && <span title={`${s.name} by day: ${formatEighths(s.day)} pages`} className="rounded-l-[4px]" style={{ width: `${(s.day / max) * 100}%`, background: SERIES[3] }} />}
              {s.night > 0 && <span title={`${s.name} by night: ${formatEighths(s.night)} pages`} className="rounded-r-[4px]" style={{ width: `${(s.night / max) * 100}%`, background: SERIES[6] }} />}
            </span>
            <span className="text-right tabular-nums" style={{ color: TEXT_2 }}>
              {formatEighths(s.day + s.night)} pp
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

// ---- schedule -------------------------------------------------------------------------

/** One strip per shoot day, segments sized by pages and coloured by set (legend below). */
export function ShootDayStrips({ days, eighthsPerDay }: { days: { day: number; light: string; strips: { scene: string; set: string; eighths: number }[] }[]; eighthsPerDay: number }) {
  const colors = categoryColors(days.flatMap((d) => d.strips.map((s) => s.set)));
  const sets = [...colors.entries()].filter(([, c]) => c !== OTHER);
  const hasOther = [...colors.values()].includes(OTHER);
  return (
    <figure className="m-0">
      <Legend items={[...sets, ...(hasOther ? ([["other sets", OTHER]] as [string, string][]) : [])]} />
      <ul className="flex flex-col gap-2.5">
        {days.map((d) => {
          const used = d.strips.reduce((n, s) => n + s.eighths, 0);
          return (
            <li key={d.day} className="grid grid-cols-[110px_1fr_auto] items-center gap-3 text-sm">
              <span className="font-semibold">
                Day {d.day} <span className="font-normal text-muted">· {d.light}</span>
              </span>
              <span className="relative flex h-7 gap-0.5 rounded-md bg-[#F1ECE0]">
                {d.strips.map((s) => (
                  <span
                    key={s.scene}
                    title={`Scene ${s.scene} · ${s.set} · ${formatEighths(s.eighths)} pages`}
                    className="flex items-center justify-center text-[11px] font-bold text-white first:rounded-l-md"
                    style={{ width: `${(s.eighths / Math.max(eighthsPerDay, used)) * 100}%`, background: colors.get(s.set) }}
                  >
                    {s.scene}
                  </span>
                ))}
              </span>
              <span className="text-right tabular-nums" style={{ color: TEXT_2 }}>
                {formatEighths(used)} / {formatEighths(eighthsPerDay)} pp
              </span>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}

// ---- budget ----------------------------------------------------------------------------

/** Cost by section, one series, largest first, value labels at bar ends. */
export function BudgetBars({ sections, money }: { sections: { section: string; amount: number }[]; money: (n: number) => string }) {
  const sorted = [...sections].sort((a, b) => b.amount - a.amount);
  const max = Math.max(1, ...sorted.map((s) => s.amount));
  const total = sorted.reduce((n, s) => n + s.amount, 0);
  return (
    <ul className="flex flex-col gap-2.5">
      {sorted.map((s) => (
        <li key={s.section} className="grid grid-cols-[minmax(130px,190px)_1fr_auto] items-center gap-3 text-sm">
          <span className="font-semibold">{s.section}</span>
          <span className="flex h-5" title={`${s.section}: ${money(s.amount)} (${Math.round((s.amount / total) * 100)}%)`}>
            <span className="rounded-r-[4px]" style={{ width: `${(s.amount / max) * 100}%`, background: SERIES[0] }} />
          </span>
          <span className="text-right tabular-nums" style={{ color: TEXT_2 }}>
            {money(s.amount)} · {Math.round((s.amount / total) * 100)}%
          </span>
        </li>
      ))}
    </ul>
  );
}
