import { Cite, SEVERITY_BAND, SeverityBadge, Stat } from "@/components/run-bits";
import { formatEighths } from "@/lib/intake/pages";
import type { BreakdownReport } from "@/lib/stages/breakdown";

const CATEGORY_LABEL: Record<string, string> = {
  extras: "Extras",
  vehicle: "Vehicle",
  animal: "Animal",
  stunt: "Stunt",
  weapon: "Weapon",
  sfx: "Effect",
  fire: "Fire",
  water: "Water",
  vfx: "VFX",
  makeup: "Makeup",
  equipment: "Equipment",
  intimacy: "Intimacy",
  minor: "Child",
};

const HIGH_CATEGORIES = new Set(["stunt", "weapon", "fire", "intimacy", "minor"]);
const MEDIUM_CATEGORIES = new Set(["water", "animal", "vehicle", "sfx", "vfx", "equipment"]);

export function BreakdownReportView({ r }: { r: BreakdownReport }) {
  const high = r.alerts.filter((a) => a.severity === "high").length;
  const pages = r.scenes.reduce((n, s) => n + s.eighths, 0);
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
        <Stat label="Department alerts" value={r.alerts.length} hint={high ? `${high} high priority` : "none high priority"} />
        <Stat label="Cast" value={r.cast.length} hint="speaking and silent" />
        <Stat label="Tagged elements" value={Object.values(r.counts).reduce((a, b) => a + (b ?? 0), 0)} hint="each cites its line" />
        <Stat label="Pages" value={formatEighths(pages)} hint={`about ${Math.max(1, Math.round(pages / 8))} min on screen`} />
      </div>
      {!r.modelRead && <p className="rounded-2xl bg-amber-soft p-4 text-sm text-amber">No model read the scenes, so only cast from dialogue, stated ages and scene headings are broken down.</p>}

      <section>
        <div className="mb-3.5 flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="font-display text-[38px] font-semibold">Who needs to act</h3>
          <span className="text-sm text-muted">Most urgent first</span>
        </div>
        {r.alerts.length === 0 ? (
          <p className="card p-7 text-sm text-muted">No department alerts.</p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
            {r.alerts.map((a, i) => (
              <article key={i} className="flex flex-col overflow-hidden rounded-[22px] border border-line bg-card">
                <div className="h-1.5" style={{ background: SEVERITY_BAND[a.severity] }} />
                <div className="flex flex-1 flex-col gap-2.5 px-5.5 pt-5 pb-5.5">
                  <div className="flex items-center justify-between gap-2.5">
                    <span className="text-xs font-bold tracking-wider text-muted uppercase">{a.department}</span>
                    <SeverityBadge severity={a.severity} />
                  </div>
                  <span className="font-display text-[28px] leading-[1.05] font-semibold">{a.title}</span>
                  <span className="text-sm leading-normal text-fg-2">{a.needs}</span>
                  <span className="text-sm leading-normal">{a.items.join(" · ")}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {a.scenes.map((s) => (
                      <span key={s} className="rounded-full bg-[#EFEBE1] px-2.5 py-1 text-xs font-semibold">
                        Scene {s}
                      </span>
                    ))}
                  </div>
                  <div className="mt-auto border-t border-line-2 pt-2.5">
                    {a.cites.slice(0, 2).map((c, j) => (
                      <Cite key={j} line={c.line} snippet={c.snippet} scene={c.sceneNumber} />
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="card p-7.5">
        <h3 className="font-display text-[32px] font-semibold">Scene by scene</h3>
        <p className="mt-1 mb-4 text-sm text-muted">Pages are estimates in eighths, the unit schedules use.</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs tracking-wider text-muted">
                <th className="px-2 py-2.5 font-semibold">SCENE</th>
                <th className="px-2 py-2.5 font-semibold">WHERE AND WHEN</th>
                <th className="px-2 py-2.5 font-semibold">CAST</th>
                <th className="px-2 py-2.5 font-semibold">NEEDS</th>
                <th className="px-2 py-2.5 text-right font-semibold">PAGES</th>
              </tr>
            </thead>
            <tbody>
              {r.scenes.map((s) => (
                <tr key={s.number} className="border-t border-line-2 align-top">
                  <td className="px-2 py-3 font-bold">{s.number}</td>
                  <td className="px-2 py-3 font-mono text-[13px]">
                    {s.heading}
                    {s.storyDay != null && <span className="ml-2 font-sans text-xs text-muted">day {s.storyDay}</span>}
                  </td>
                  <td className="px-2 py-3 text-fg-2">{s.cast.join(", ") || "—"}</td>
                  <td className="px-2 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {s.elements.map((e, i) => (
                        <span
                          key={i}
                          title={`line ${e.cite.line}: ${e.cite.snippet}`}
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${HIGH_CATEGORIES.has(e.category) ? "bg-rose-soft text-rose" : MEDIUM_CATEGORIES.has(e.category) ? "bg-amber-soft text-amber" : "bg-[#E3F3F0] text-[#136B61]"}`}
                        >
                          {CATEGORY_LABEL[e.category] ?? e.category}: {e.item}
                        </span>
                      ))}
                      {s.wardrobe.length > 0 && (
                        <span className="rounded-full bg-[#E3F3F0] px-2.5 py-1 text-xs font-semibold text-[#136B61]" title={s.wardrobe.map((w) => `${w.character}: ${w.garment}`).join("; ")}>
                          Wardrobe ×{s.wardrobe.length}
                        </span>
                      )}
                      {s.props.length > 0 && (
                        <span className="rounded-full bg-[#E3F3F0] px-2.5 py-1 text-xs font-semibold text-[#136B61]" title={s.props.join(", ")}>
                          Props: {s.props.join(", ")}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-3 text-right tabular-nums">{s.pages}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card p-7.5">
        <h3 className="font-display text-[32px] font-semibold">Cast</h3>
        <p className="mt-1 mb-4 text-sm text-muted">Scenes and estimated pages per character.</p>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2.5">
          {r.cast.map((c) => (
            <li key={c.name} className="flex items-baseline justify-between gap-3 rounded-xl bg-[#F5F1E7] px-3.5 py-2.5 text-sm">
              <span className="font-semibold">{c.name}</span>
              <span className="text-fg-2 tabular-nums">
                {c.scenes.length} scene{c.scenes.length > 1 ? "s" : ""} · {formatEighths(c.eighths)} pp
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
