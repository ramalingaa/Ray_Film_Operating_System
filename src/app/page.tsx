import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { ArrowRight } from "lucide-react";
import { startSampleRun, startSampleStory } from "@/app/actions";
import { JourneyMap } from "@/components/journey/journey-map";
import { STAGE_LOOK, StarMark } from "@/components/journey/stage-look";
import { Loading, SetupNeeded } from "@/components/nav";
import { databaseProblem, getDb } from "@/lib/db/client";
import { CHAPTERS } from "@/lib/stages/chapters";
import { listRuns } from "@/lib/ui/runs";

/** Starting a sample also takes its first step in the background, which can take minutes. */
export const maxDuration = 300;

export default function Home() {
  return (
    <Suspense fallback={<Loading />}>
      <Productions />
    </Suspense>
  );
}

const STATE_TEXT: Record<string, string> = {
  awaiting_input: "Your move",
  working: "Working on it",
  ready: "Ready for your review",
  failed: "Needs attention",
  locked: "Waiting",
  approved: "Approved",
  skipped: "Skipped",
};

async function Productions() {
  await connection();
  const problem = databaseProblem();
  if (problem) return <SetupNeeded problem={problem} />;
  const recent = await listRuns(await getDb());
  const story = STAGE_LOOK.story;
  const script = STAGE_LOOK.script;

  return (
    <div>
      {/* Hero: two doors */}
      <section className="relative overflow-hidden bg-ink px-6 pt-[72px] pb-28 text-on-ink sm:px-8">
        {[
          [12, 18, 2, 0.6],
          [31, 72, 2, 0.45],
          [58, 12, 3, 0.8],
          [77, 38, 2, 0.5],
          [90, 80, 2, 0.4],
          [44, 88, 2, 0.35],
        ].map(([x, y, s, o], i) => (
          <span key={i} aria-hidden className="absolute rounded-full" style={{ left: `${x}%`, top: `${y}%`, width: s, height: s, opacity: o, background: i === 2 ? "#E2C46B" : "#fff" }} />
        ))}
        <div className="relative mx-auto max-w-[1240px]">
          <p className="eyebrow mb-4.5 text-gold-bright">Pre-production, stage by stage</p>
          <h1 className="font-display max-w-[880px] text-5xl leading-[1.02] font-semibold tracking-[-0.01em] sm:text-[76px]">From the first idea to the first day of shooting.</h1>
          <p className="mt-6 max-w-[640px] text-[19px] leading-relaxed text-on-ink-2">
            Bring a story or a screenplay. Every stage is tested, every finding points to the exact line it came from, and nothing moves forward until you sign it off.
          </p>

          <div className="mt-13 flex flex-wrap gap-5">
            <Link href="/new?from=story" className="flex min-w-0 flex-[1_1_420px] flex-col gap-3.5 rounded-3xl bg-ivory p-8 text-fg no-underline shadow-[0_30px_60px_-30px_rgba(0,0,0,0.6)] transition hover:-translate-y-0.5">
              <div className="flex items-center justify-between">
                <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: story.soft, color: story.deep }}>
                  <story.Icon aria-hidden size={26} strokeWidth={1.8} />
                </span>
                <span className="rounded-full px-3 py-1.5 text-[13px] font-semibold" style={{ background: story.soft, color: story.deep }}>
                  Begins at step 1
                </span>
              </div>
              <span className="font-display text-[40px] leading-[1.05] font-semibold">Start with a story</span>
              <span className="text-base leading-normal text-fg-2">
                A logline, a treatment or a few paragraphs. We test the story before a single scene is written, then turn it into a screenplay when you are ready.
              </span>
              <span className="btn-dark mt-1.5 self-start">
                Start the story <ArrowRight aria-hidden size={18} />
              </span>
            </Link>

            <Link href="/new?from=screenplay" className="flex min-w-0 flex-[1_1_420px] flex-col gap-3.5 rounded-3xl border border-[#2C3156] bg-ink-2 p-8 text-on-ink no-underline transition hover:-translate-y-0.5">
              <div className="flex items-center justify-between">
                <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: script.onInkBg, color: "#A9C2F5" }}>
                  <script.Icon aria-hidden size={26} strokeWidth={1.8} />
                </span>
                <span className="rounded-full px-3 py-1.5 text-[13px] font-semibold" style={{ background: script.onInkBg, color: "#A9C2F5" }}>
                  Begins at step 2
                </span>
              </div>
              <span className="font-display text-[40px] leading-[1.05] font-semibold">I already have a screenplay</span>
              <span className="text-base leading-normal text-on-ink-2">Fountain, Final Draft or plain text. Skip straight to the screenplay checks, then on to breakdown, places, schedule and budget.</span>
              <span className="btn-gold mt-1.5 self-start">
                Upload the screenplay <ArrowRight aria-hidden size={18} />
              </span>
            </Link>
          </div>
          <div className="mt-5.5 flex flex-wrap items-center gap-x-1.5 text-sm text-on-ink-2">
            New here? Open a sample:
            <form action={startSampleStory} className="inline">
              <button className="cursor-pointer text-gold-bright underline underline-offset-4">The Night Ferry</button>
            </form>
            (a story) or
            <form action={startSampleRun} className="inline">
              <button className="cursor-pointer text-gold-bright underline underline-offset-4">The Keeper’s Ledger</button>
            </form>
            (a screenplay).
          </div>
        </div>
      </section>

      {/* The journey */}
      <section className="px-6 pt-24 pb-10 sm:px-8">
        <div className="mx-auto max-w-[1240px]">
          <p className="eyebrow mb-3 text-gold-deep">The journey</p>
          <h2 className="font-display max-w-[760px] text-[52px] leading-[1.05] font-semibold">Six stages. One connected production.</h2>
          <p className="mt-4 max-w-[680px] text-[17px] leading-relaxed text-fg-2">
            Each stage reads what the last one approved. Change the story and everything after it is re-checked, the way a real rewrite ripples through a production office.
          </p>
          <JourneyMap />
        </div>
      </section>

      {/* Productions */}
      {recent.length > 0 && (
        <section className="px-6 pt-14 pb-24 sm:px-8">
          <div className="mx-auto max-w-[1240px]">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h2 className="font-display text-[44px] font-semibold">Your productions</h2>
              <Link href="/new" className="text-[15px] font-semibold text-gold-deep">
                New production
              </Link>
            </div>
            <div className="mt-7 grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-5">
              {recent.map((r) => {
                const chapter = CHAPTERS[r.current];
                const look = STAGE_LOOK[chapter.id];
                return (
                  <Link key={r.id} href={`/runs/${r.id}`} className="flex flex-col overflow-hidden rounded-[20px] border border-line bg-card text-fg no-underline transition hover:-translate-y-0.5 hover:border-gold">
                    <div className={`flex h-32 flex-col justify-between p-5 ${r.greenlit ? "bg-ink" : "bg-ink-2"}`}>
                      {r.greenlit ? (
                        <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-gold-bright px-2.5 py-1 text-xs font-semibold text-[#1F1703]">
                          <StarMark size={12} /> Greenlit
                        </span>
                      ) : (
                        <span className="self-start rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: look.onInkBg, color: look.onInkFg }}>
                          Step {r.current + 1} · {chapter.title}
                        </span>
                      )}
                      <span className="font-display text-[30px] leading-none font-semibold text-on-ink">{r.title}</span>
                    </div>
                    <div className="flex flex-col gap-3 px-5 pt-4.5 pb-5">
                      <div className="grid grid-cols-6 gap-1" aria-label={`${r.chaptersApproved} of ${r.chaptersTotal} stages approved`}>
                        {CHAPTERS.map((c, i) => (
                          <span
                            key={c.id}
                            className="h-1.5 rounded-full"
                            style={{ background: i <= r.approvedThrough ? STAGE_LOOK[c.id].base : i === r.current ? `${STAGE_LOOK[c.id].base}73` : "var(--line)" }}
                          />
                        ))}
                      </div>
                      <span className="text-sm font-semibold" style={{ color: r.greenlit ? "var(--gold-deep)" : look.deep }}>
                        {r.greenlit ? "All six stages signed off" : (STATE_TEXT[r.currentState] ?? "")}
                      </span>
                      <span className="text-[13px] text-muted">
                        From a {r.inputKind} · {(r.updatedAt ?? r.createdAt).slice(0, 10)}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
