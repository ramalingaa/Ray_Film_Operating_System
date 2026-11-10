import Link from "next/link";
import { ArrowRight, Check, Clapperboard, Compass, Feather, LoaderCircle, MessageSquare, Quote, Sparkles, Users } from "lucide-react";
import { startSampleRun, startSampleStory } from "@/app/actions";
import { JourneyMap } from "@/components/journey/journey-map";
import { StarMark } from "@/components/journey/stage-look";

/** Starting a sample hands it to the agent, whose first turn runs right after the response. */
export const maxDuration = 300;

const AUDIENCES = [
  {
    Icon: Clapperboard,
    title: "Production houses",
    body: "See what a project needs before you commit: cast, sets, shoot days and a rough budget, each traced to the page it comes from.",
  },
  {
    Icon: Feather,
    title: "Writers",
    body: "Test your story's structure and the script's continuity before anyone else reads it, and fix what the notes point to.",
  },
  {
    Icon: Compass,
    title: "Directors",
    body: "Walk into prep with a breakdown, a draft stripboard and the open questions each department will ask.",
  },
  {
    Icon: Users,
    title: "Anyone with an idea",
    body: "Go from a logline to a plan you can share and pitch, without needing to know the jargon first.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "You bring the idea",
    body: "A logline, a treatment or a finished screenplay. Add notes the way you would brief a producer: keep it to one location, stop after the breakdown.",
  },
  {
    n: "02",
    title: "The AI drafts and tests",
    body: "It works through each chapter, from story to budget, showing every step it takes and every finding with the line it came from. It keeps going in the background.",
  },
  {
    n: "03",
    title: "You steer and revise",
    body: "Message it, revise the story or the script, reopen any chapter. Everything after a change is checked again, so the plan always matches the story.",
  },
];

const PRINCIPLES = [
  { title: "Every note shows its source", body: "Each finding points to the document and line it comes from, so you can check it in seconds rather than take it on trust." },
  { title: "Conflicts, not verdicts", body: "Notes say where two things disagree. You decide whether it is a mistake or intentional, and that choice is remembered." },
  { title: "A first plan, not the final word", body: "The AI moves fast to a complete draft so your time goes into decisions. Nothing is locked; every chapter can be reopened." },
];

export default function Landing() {
  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-ink px-6 pt-20 pb-24 text-on-ink sm:px-8">
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
        <div className="relative mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-14 gap-y-12">
          <div className="min-w-0 flex-[1_1_520px]">
            <p className="eyebrow mb-4.5 text-gold-bright">Pre-production, made together</p>
            <h1 className="font-display text-5xl leading-[1.02] font-semibold tracking-[-0.01em] sm:text-[72px]">Take any idea to a production-ready plan.</h1>
            <p className="mt-6 max-w-[600px] text-[19px] leading-relaxed text-on-ink-2">
              For production houses, writers, directors and anyone with a story worth making. An AI partner drafts and tests every stage, from the story to the budget, and you review,
              revise and decide along the way.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-3.5">
              <Link href="/projects" className="btn-gold min-h-14! px-7! text-base!">
                Start a project <ArrowRight aria-hidden size={18} />
              </Link>
              <form action={startSampleStory}>
                <button className="btn-ink-ghost min-h-14! px-6! text-base!">Try a sample story</button>
              </form>
            </div>
            <div className="mt-5 text-sm text-on-ink-2">
              Already have a screenplay?{" "}
              <Link href="/projects?from=screenplay" className="text-gold-bright underline underline-offset-4">
                Start from the script
              </Link>{" "}
              or open{" "}
              <form action={startSampleRun} className="inline">
                <button className="cursor-pointer text-gold-bright underline underline-offset-4">the sample screenplay</button>
              </form>
              .
            </div>
          </div>
          <Glimpse />
        </div>
      </section>

      {/* Who it is for */}
      <section className="px-6 pt-24 pb-6 sm:px-8">
        <div className="mx-auto max-w-[1240px]">
          <p className="eyebrow mb-3 text-gold-deep">Who it is for</p>
          <h2 className="font-display max-w-[760px] text-[44px] leading-[1.05] font-semibold sm:text-[52px]">Wherever the idea starts, it gets to the same place.</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {AUDIENCES.map((a) => (
              <div key={a.title} className="card flex flex-col gap-3 p-6">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-soft text-gold-deep">
                  <a.Icon aria-hidden size={22} strokeWidth={1.8} />
                </span>
                <h3 className="font-display text-[28px] leading-tight font-semibold">{a.title}</h3>
                <p className="text-[15px] leading-relaxed text-fg-2">{a.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="px-6 pt-24 pb-6 sm:px-8">
        <div className="mx-auto max-w-[1240px]">
          <p className="eyebrow mb-3 text-gold-deep">How you work together</p>
          <h2 className="font-display max-w-[820px] text-[44px] leading-[1.05] font-semibold sm:text-[52px]">The AI does the legwork. You make the calls.</h2>
          <ol className="mt-10 grid gap-4 lg:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="flex flex-col gap-3 rounded-[22px] border border-line bg-card p-7">
                <span className="font-display text-[44px] leading-none font-semibold text-gold">{s.n}</span>
                <h3 className="font-display text-[30px] leading-tight font-semibold">{s.title}</h3>
                <p className="text-[15px] leading-relaxed text-fg-2">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* The journey */}
      <section className="px-6 pt-24 pb-10 sm:px-8">
        <div className="mx-auto max-w-[1240px]">
          <p className="eyebrow mb-3 text-gold-deep">From story to greenlight</p>
          <h2 className="font-display max-w-[760px] text-[44px] leading-[1.05] font-semibold sm:text-[52px]">Six chapters. One connected plan.</h2>
          <p className="mt-4 max-w-[680px] text-[17px] leading-relaxed text-fg-2">
            Each chapter reads what the last one settled. Change the story and everything after it is checked again, the way a rewrite ripples through a real production office.
          </p>
          <JourneyMap />
        </div>
      </section>

      {/* Principles */}
      <section className="px-6 pt-20 pb-24 sm:px-8">
        <div className="mx-auto grid max-w-[1240px] gap-4 lg:grid-cols-3">
          {PRINCIPLES.map((p) => (
            <div key={p.title} className="flex gap-4 border-t border-line pt-6">
              <Check aria-hidden size={20} strokeWidth={2.4} className="mt-1 flex-none text-ok" />
              <div>
                <h3 className="text-lg font-semibold">{p.title}</h3>
                <p className="mt-1.5 text-[15px] leading-relaxed text-fg-2">{p.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Call to action */}
      <section className="px-6 pb-24 sm:px-8">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-8 rounded-[28px] bg-ink px-8 py-12 text-on-ink sm:px-12">
          <div className="max-w-[640px]">
            <h2 className="font-display text-[40px] leading-[1.05] font-semibold sm:text-[48px]">Bring the idea. Leave with a plan.</h2>
            <p className="mt-3 text-[17px] leading-relaxed text-on-ink-2">Start with a few lines. The first chapter is ready in about a minute, and you can follow every step.</p>
          </div>
          <Link href="/projects" className="btn-gold min-h-14! px-7! text-base!">
            Start a project <ArrowRight aria-hidden size={18} />
          </Link>
        </div>
      </section>

      <footer className="border-t border-line px-6 py-8 text-sm text-muted sm:px-8">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <StarMark size={14} className="text-gold" /> ReelGraph · pre-production for everyone with a story
          </span>
          <Link href="/projects" className="text-fg-2">
            Your projects
          </Link>
        </div>
      </footer>
    </div>
  );
}

/** A still of the workspace: the AI working, a person steering, and a note that cites its line. */
function Glimpse() {
  return (
    <div aria-hidden className="min-w-0 flex-[1_1_420px]">
      <div className="rounded-[24px] bg-ivory p-5 text-fg shadow-[0_30px_60px_-30px_rgba(0,0,0,0.7)]">
        <div className="flex items-center justify-between border-b border-line pb-3">
          <span className="font-display text-[22px] font-semibold">The Night Ferry</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-ink px-2.5 py-1 text-xs font-semibold text-on-ink">
            <span className="pulse h-1.5 w-1.5 rounded-full bg-gold-bright" /> Working
          </span>
        </div>
        <ul className="mt-4 flex flex-col gap-3 text-sm">
          <li className="flex gap-2.5">
            <Check size={15} strokeWidth={2.6} className="mt-0.5 flex-none text-ok" />
            <span>
              <span className="font-semibold">Tested the story</span>
              <span className="block text-[13px] text-fg-2">13 of 15 beats land · 2 questions to answer</span>
            </span>
          </li>
          <li className="flex gap-2.5">
            <span className="mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full bg-ink text-gold-bright">
              <Sparkles size={11} />
            </span>
            <span className="leading-relaxed">The midpoint arrives late. I tightened the harbour scene and kept your ending as it is.</span>
          </li>
          <li className="ml-8 self-end rounded-2xl rounded-br-md bg-fg px-3.5 py-2 text-ivory">Good. Keep Asha on the ferry the whole night.</li>
          <li className="flex gap-2.5">
            <LoaderCircle size={15} className="spin mt-0.5 flex-none text-gold-deep" />
            <span>
              <span className="font-semibold">Writing the screenplay</span>
              <span className="block text-[13px] text-fg-2">Scene 6 of 11</span>
            </span>
          </li>
        </ul>
        <div className="mt-4 rounded-2xl border border-line bg-card p-3.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-rose uppercase">
            <MessageSquare size={12} /> Continuity · high
          </p>
          <p className="mt-1.5 text-sm">Asha&rsquo;s coat is soaked in scene 4 and dry in the next scene, minutes later.</p>
          <p className="mt-2 flex gap-1.5 text-xs text-muted">
            <Quote size={12} className="flex-none" /> line 112 · &ldquo;She wrings out the coat&hellip;&rdquo;
          </p>
        </div>
      </div>
    </div>
  );
}
