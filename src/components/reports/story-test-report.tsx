import { StarMark, STAGE_LOOK } from "@/components/journey/stage-look";
import { Cite, SeverityBadge } from "@/components/run-bits";
import type { Skipped } from "@/lib/stages/story";
import type { StoryTestReport } from "@/lib/stages/story-test";
import { pct } from "@/lib/story/beats";

const look = STAGE_LOOK.story;

export function StoryTestReportView({ r }: { r: StoryTestReport | Skipped }) {
  if ("skipped" in r) return <p className="card p-7 text-fg-2">{r.skipped}</p>;
  const l = r.logline;
  const present = r.beats.filter((b) => b.present).length;
  const fields = [
    ["Protagonist", l.protagonist],
    ["Wants", l.goal],
    ["Stakes", l.stakes],
    ["Standing in the way", l.obstacle],
  ] as const;

  return (
    <div className="flex flex-col gap-6">
      {/* the story in one sentence */}
      <section className="rounded-[26px] bg-ink p-9 text-on-ink">
        <p className="eyebrow text-gold-bright">The story in one sentence</p>
        <p className="font-display mt-3.5 max-w-[900px] text-[34px] leading-tight italic">{l.one_sentence}</p>
        <div className="mt-7 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3.5">
          {fields.map(([k, v]) =>
            v ? (
              <div key={k} className="flex flex-col gap-1.5 rounded-2xl bg-ink-2 p-4">
                <span className="text-xs font-semibold tracking-wider text-on-ink-2 uppercase">{k}</span>
                <span className="text-[15px] leading-snug">{v}</span>
              </div>
            ) : (
              <div key={k} className="flex flex-col gap-1.5 rounded-2xl border border-[#8F6A1E] bg-[#3A2A12] p-4">
                <span className="text-xs font-semibold tracking-wider text-[#F2C66D] uppercase">{k}</span>
                <span className="text-[15px] leading-snug text-[#F7DFA6]">Not clear yet</span>
              </div>
            ),
          )}
        </div>
        <p className="mt-5 text-xs text-on-ink-2">
          Read by {r.model}
          {r.cacheHit ? " (cached)" : ""} · {r.words.toLocaleString()} words
        </p>
      </section>

      {/* works / questions */}
      <div className="flex flex-wrap gap-6">
        <section className="card min-w-0 flex-[1_1_340px] p-7.5">
          <h3 className="font-display mb-4 text-[32px] font-semibold">What already works</h3>
          {r.strengths.length === 0 ? (
            <p className="text-sm text-muted">Nothing called out yet.</p>
          ) : (
            <ul className="flex flex-col gap-4.5">
              {r.strengths.map((s, i) => (
                <li key={i} className="flex gap-3">
                  <StarMark size={18} className="mt-0.5 flex-none text-gold" />
                  <div>
                    <p className="text-[15px] leading-normal">{s.point}</p>
                    {s.cite && (
                      <div className="mt-1.5">
                        <Cite line={s.cite.line} snippet={s.cite.snippet} />
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card min-w-0 flex-[1_1_340px] p-7.5">
          <h3 className="font-display text-[32px] font-semibold">Questions before the screenplay</h3>
          <p className="mt-1 mb-4 text-sm text-muted">What a producer would ask the writer.</p>
          <ol className="flex flex-col gap-3.5">
            {r.questions.map((q, i) => (
              <li key={i} className="flex gap-3">
                <span className="inline-flex h-6.5 w-6.5 flex-none items-center justify-center rounded-full text-[13px] font-bold" style={{ background: look.soft, color: look.deep }}>
                  {i + 1}
                </span>
                <span className="text-[15px] leading-normal">
                  <strong className="font-semibold">{q.question}</strong> <span className="text-fg-2">{q.why}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      {/* beats */}
      <section className="card p-7.5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="font-display text-[32px] font-semibold">The 15 beats</h3>
          <span className="text-sm text-fg-2">
            <strong className="text-fg">{present} of 15</strong> are already in the story
          </span>
        </div>
        <div aria-hidden className="mt-4.5 grid grid-cols-15 gap-1">
          {r.beats.map((b) => (
            <span key={b.id} className="h-2.5 rounded-full" style={{ background: b.present ? look.base : "var(--line)" }} />
          ))}
        </div>
        <div className="mt-4.5 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2.5">
          {r.beats.map((b, i) => (
            <div
              key={b.id}
              className="flex flex-col gap-1 rounded-xl border px-3 py-2.5"
              style={b.present ? { borderColor: "#D9D2F8", background: "#F6F4FE" } : { borderColor: "var(--line)", background: "#fff" }}
            >
              <div className="flex items-center gap-2.5">
                <span className="text-xs font-bold text-muted">{String(i + 1).padStart(2, "0")}</span>
                <span className="flex-1 text-sm font-semibold">{b.title}</span>
                <span className="text-xs font-semibold" style={{ color: b.present ? look.deep : "var(--amber)" }}>
                  {b.present ? "In the story" : "Not yet"}
                </span>
              </div>
              {b.position != null && (
                <span className="text-xs text-muted">
                  at {pct(b.position)} · usually {b.expected}
                  {b.timing !== "on_time" && <span className="text-amber"> · {b.timing}</span>}
                </span>
              )}
              <span className="text-[13px] leading-snug text-fg-2">{b.note}</span>
            </div>
          ))}
        </div>
        {r.tooShortToTime && <p className="mt-3 text-[13px] text-muted">Too short to measure where the beats land; this shows which are there.</p>}
      </section>

      {/* notes */}
      <section className="card p-7.5">
        <h3 className="font-display mb-2 text-[32px] font-semibold">Development notes</h3>
        {r.issues.length === 0 ? (
          <p className="text-sm text-muted">Nothing flagged.</p>
        ) : (
          <ul>
            {r.issues.map((n, i) => (
              <li key={i} className="flex gap-4 border-t border-line-2 py-4 first:border-t-0">
                <SeverityBadge severity={n.severity} />
                <div className="flex flex-col gap-1">
                  <span className="text-base font-semibold">{n.title}</span>
                  <span className="text-sm leading-normal text-fg-2">{n.detail}</span>
                  {n.cites.map((c, j) => (
                    <Cite key={j} line={c.line} snippet={c.snippet} />
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
        {r.setups.length > 0 && (
          <div className="mt-4 border-t border-line-2 pt-4">
            <p className="eyebrow mb-2 text-muted">Setups and payoffs</p>
            <ul className="flex flex-col gap-1 text-sm">
              {r.setups.map((s, i) => (
                <li key={i}>
                  {s.description}: <span className={s.paidOff ? "text-ok" : "font-semibold text-rose"}>{s.paidOff ? "pays off" : "never pays off"}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {r.dropped.length > 0 && (
          <details className="mt-4 text-xs text-muted">
            <summary className="cursor-pointer">{r.dropped.length} point(s) left out because their quote was not in the story</summary>
            <ul className="mt-1 list-disc pl-5">
              {r.dropped.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          </details>
        )}
      </section>
    </div>
  );
}
