import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { startRun, startSampleRun, startSampleStory } from "@/app/actions";
import { Loading, SetupNeeded, Star } from "@/components/nav";
import { databaseProblem, getDb } from "@/lib/db/client";
import { availableGateway } from "@/lib/llm/available";
import { CHAPTERS } from "@/lib/stages/chapters";
import { listRuns } from "@/lib/ui/runs";

/** Starting a production also takes its first step in the background (see kickOff), which can take minutes. */
export const maxDuration = 300;

export default function Home() {
  return (
    <Suspense fallback={<Loading />}>
      <Productions />
    </Suspense>
  );
}

async function Productions() {
  await connection();
  const problem = databaseProblem();
  if (problem) return <SetupNeeded problem={problem} />;
  const recent = await listRuns(await getDb());
  const { gateway, reason } = availableGateway(["extract", "judge"]);

  return (
    <div>
      <section className="night-sky px-6 pt-14 pb-24">
        <div className="mx-auto max-w-5xl">
          <p className="mb-3 text-xs tracking-[0.3em] text-[#e9dfc4] uppercase">From once upon a time to the first day of shooting</p>
          <h1 className="font-display max-w-3xl text-5xl leading-[1.05] font-semibold sm:text-6xl">
            Every film begins <br className="hidden sm:block" />
            with <em className="gold-text">a story.</em>
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-[#dcd6ee]">
            Bring a story or a screenplay. Each chapter is tested, explained line by line, and signed off by you before the next one opens, just
            as a production team would work.
          </p>
          <ol className="mt-10 grid grid-cols-3 gap-x-4 gap-y-5 sm:grid-cols-6">
            {CHAPTERS.map((c) => (
              <li key={c.id} className="flex flex-col items-start gap-1">
                <span className="font-display text-2xl text-[#f2d27e]">{c.numeral}</span>
                <span className="text-sm text-[#efe8d6]">{c.title.replace(/^The /, "")}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <div className="mx-auto -mt-14 grid max-w-5xl gap-6 px-6 md:grid-cols-2">
        <BeginCard
          numeral="I"
          title="Begin with a story"
          blurb="A logline, a treatment or a short story. We test it first, then write the screenplay from it when you are ready."
        >
          <form action={startRun} className="space-y-3">
            <input name="title" className="field" placeholder="Title (optional)" />
            <textarea name="text" rows={7} className="field font-display text-lg leading-snug" placeholder="Once upon a time, on the last night ferry across a stormy bay…" />
            <label className="block text-sm text-ink-soft">
              …or upload it (.txt, .md)
              <input type="file" name="file" accept=".txt,.md,.text" className="mt-1 block w-full text-sm" />
            </label>
            <button className="btn-gold">
              <Star /> Begin the story
            </button>
          </form>
          <form action={startSampleStory} className="mt-3">
            <button className="text-sm text-gold underline-offset-4 hover:underline">or open the sample story, “The Night Ferry”</button>
          </form>
        </BeginCard>

        <BeginCard numeral="II" title="Begin with a screenplay" blurb="Already written? Start at chapter two. Fountain, Final Draft (.fdx) or plain text.">
          <form action={startRun} className="space-y-3">
            <input name="title" className="field" placeholder="Title (taken from the file if empty)" />
            <label className="block text-sm text-ink-soft">
              Upload the screenplay (.fountain, .fdx, .txt)
              <input type="file" name="file" accept=".fountain,.fdx,.txt,.md" className="mt-1 block w-full text-sm" />
            </label>
            <textarea name="text" rows={4} className="field font-mono text-xs" placeholder={"…or paste it\n\nINT. HARBOR OFFICE - NIGHT\n\nVoss looks up from his desk."} />
            <details className="text-sm text-ink-soft">
              <summary className="cursor-pointer">Costume and location sheets (optional)</summary>
              <div className="mt-2 space-y-2">
                <label className="block">
                  Costume sheet (.csv)
                  <input type="file" name="costumes" accept=".csv" className="mt-1 block w-full text-sm" />
                </label>
                <label className="block">
                  Location sheet (.csv)
                  <input type="file" name="locations" accept=".csv" className="mt-1 block w-full text-sm" />
                </label>
              </div>
            </details>
            <button className="btn-gold">
              <Star /> Begin from the script
            </button>
          </form>
          <form action={startSampleRun} className="mt-3">
            <button className="text-sm text-gold underline-offset-4 hover:underline">or open the sample screenplay, “The Keeper’s Ledger”</button>
          </form>
        </BeginCard>
      </div>

      <p className="mx-auto mt-4 max-w-5xl px-6 text-xs text-muted">
        {gateway ? <>Read by {gateway.specs("extract")[0].replace(/^openrouter:/, "")}, with fallbacks.</> : <>No model is configured ({reason}). Only the code-based checks will run.</>}
      </p>

      {recent.length > 0 && (
        <section className="mx-auto max-w-5xl px-6 py-14">
          <h2 className="font-display mb-6 text-3xl font-semibold">Your productions</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((r) => {
              const next = CHAPTERS[Math.min(r.approvedThrough + 1, CHAPTERS.length - 1)];
              return (
                <Link key={r.id} href={`/runs/${r.id}`} className="card group block p-5 transition hover:-translate-y-0.5 hover:border-gold">
                  <div className="mb-3 flex gap-1.5" aria-label={`${r.chaptersApproved} of ${r.chaptersTotal} chapters approved`}>
                    {CHAPTERS.map((c, i) => (
                      <Star key={c.id} className={`h-4 w-4 ${i <= r.approvedThrough ? "text-gold" : "text-line"}`} />
                    ))}
                  </div>
                  <h3 className="font-display text-2xl leading-tight font-semibold group-hover:text-gold">{r.title}</h3>
                  <p className="mt-1 text-sm text-muted">
                    {r.greenlit ? (
                      <span className="font-semibold text-gold">Greenlit for production</span>
                    ) : (
                      <>
                        Chapter {next.numeral} · {next.title}
                      </>
                    )}
                  </p>
                  <p className="mt-3 text-xs text-muted">
                    from a {r.inputKind} · {r.createdAt.slice(0, 10)}
                  </p>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function BeginCard({ numeral, title, blurb, children }: { numeral: string; title: string; blurb: string; children: React.ReactNode }) {
  return (
    <section className="card p-6">
      <div className="mb-1 flex items-baseline gap-3">
        <span className="font-display text-3xl text-gold">{numeral}</span>
        <h2 className="font-display text-3xl font-semibold">{title}</h2>
      </div>
      <p className="mb-4 text-sm text-ink-soft">{blurb}</p>
      {children}
    </section>
  );
}
