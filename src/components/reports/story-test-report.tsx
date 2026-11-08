import { Cite, Section, SeverityBadge } from "@/components/run-bits";
import { Star } from "@/components/nav";
import type { Skipped } from "@/lib/stages/story";
import type { StoryTestReport } from "@/lib/stages/story-test";
import { pct } from "@/lib/story/beats";

export function StoryTestReportView({ r }: { r: StoryTestReport | Skipped }) {
  if ("skipped" in r) return <p className="text-ink-soft">{r.skipped}</p>;
  const l = r.logline;
  const present = r.beats.filter((b) => b.present).length;
  return (
    <div>
      <div className="card mb-8 p-6">
        <p className="mb-1 text-xs tracking-[0.25em] text-muted uppercase">The story, in one sentence</p>
        <p className="font-display text-2xl leading-snug italic">{l.one_sentence}</p>
        <dl className="mt-4 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          {(
            [
              ["Protagonist", l.protagonist],
              ["Wants", l.goal],
              ["Stakes", l.stakes],
              ["Standing in the way", l.obstacle],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="flex gap-3">
              <dt className="w-36 shrink-0 text-muted">{k}</dt>
              <dd className={v ? "" : "text-rose"}>{v ?? "not clear yet"}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-xs text-muted">
          Read by {r.model}
          {r.cacheHit ? " (cached)" : ""} · {r.words.toLocaleString()} words
        </p>
      </div>

      {r.strengths.length > 0 && (
        <Section title="What already works">
          <ul className="space-y-2">
            {r.strengths.map((s, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <Star className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                <span>
                  {s.point}
                  {s.cite && (
                    <span className="block">
                      <Cite line={s.cite.line} snippet={s.cite.snippet} />
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {r.questions.length > 0 && (
        <Section title="Questions before we write the screenplay" note="What a producer would ask the writer.">
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            {r.questions.map((q, i) => (
              <li key={i}>
                <span className="font-semibold">{q.question}</span> <span className="text-ink-soft">{q.why}</span>
              </li>
            ))}
          </ol>
        </Section>
      )}

      <Section title={`Development notes (${r.issues.length})`}>
        {r.issues.length === 0 ? (
          <p className="text-sm text-muted">Nothing flagged.</p>
        ) : (
          <ul className="space-y-3">
            {r.issues.map((i, k) => (
              <li key={k} className="text-sm">
                <div className="flex items-start gap-2">
                  <SeverityBadge severity={i.severity} />
                  <span className="font-semibold">{i.title}</span>
                </div>
                <p className="mt-0.5 text-ink-soft">{i.detail}</p>
                {i.cites.map((c, j) => (
                  <Cite key={j} line={c.line} snippet={c.snippet} />
                ))}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title={`The 15 beats (${present} present)`}
        note={r.tooShortToTime ? "This is too short to measure where beats land; it only shows which are there." : "Where each beat lands, as a share of the story."}
      >
        <div className="grid gap-2 sm:grid-cols-3">
          {r.beats.map((b) => (
            <div key={b.id} className={`rounded-xl border p-3 text-sm ${b.present ? "border-gold/50 bg-gold-soft/40" : "border-line"}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{b.title}</span>
                {b.present ? <Star className="h-4 w-4 text-gold" /> : <span className="text-xs text-muted">not yet</span>}
              </div>
              {b.position != null && (
                <div className="mt-1 text-xs text-muted">
                  at {pct(b.position)} · usually {b.expected}
                  {b.timing !== "on_time" && <span className="text-rose"> · {b.timing}</span>}
                </div>
              )}
              <p className="mt-1 text-ink-soft">{b.note}</p>
            </div>
          ))}
        </div>
      </Section>

      {r.setups.length > 0 && (
        <Section title="Setups and payoffs">
          <ul className="space-y-1 text-sm">
            {r.setups.map((s, i) => (
              <li key={i} className={s.paidOff ? "" : "text-rose"}>
                {s.description}: {s.paidOff ? "pays off" : "never pays off"}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {r.dropped.length > 0 && (
        <details className="text-xs text-muted">
          <summary className="cursor-pointer">{r.dropped.length} point(s) left out because their quote was not in the story</summary>
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
