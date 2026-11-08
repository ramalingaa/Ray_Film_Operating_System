import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { approveChapterAction, reopenChapterAction, retryFailedRun, setScriptAction, updateStoryAction, writeScriptAction } from "@/app/actions";
import { Loading, SetupNeeded, Star } from "@/components/nav";
import { BreakdownReportView } from "@/components/reports/breakdown-report";
import { BudgetReportView } from "@/components/reports/budget-report";
import { ContinuityReportView } from "@/components/reports/continuity-report";
import { IntakeReportView } from "@/components/reports/intake-report";
import { LocationsReportView } from "@/components/reports/locations-report";
import { ScheduleReportView } from "@/components/reports/schedule-report";
import { StoryReportView } from "@/components/reports/story-report";
import { StoryTestReportView } from "@/components/reports/story-test-report";
import { RunDriver } from "@/components/run-driver";
import { databaseProblem, getDb, type Db } from "@/lib/db/client";
import type { BreakdownReport } from "@/lib/stages/breakdown";
import type { BudgetReport } from "@/lib/stages/budget";
import type { ContinuityReport } from "@/lib/stages/continuity";
import type { IntakeReport } from "@/lib/stages/intake";
import type { LocationsReport } from "@/lib/stages/locations";
import type { ScheduleReport } from "@/lib/stages/schedule";
import type { Skipped, StoryReport } from "@/lib/stages/story";
import type { StoryTestReport } from "@/lib/stages/story-test";
import { loadReview } from "@/lib/ui/queries";
import { loadRun, openHighCount, type ChapterView, type RunView, type StageView } from "@/lib/ui/runs";

/** Each step a production takes is a server action on this page; it saves progress well before this limit. */
export const maxDuration = 300;

type Params = Promise<{ id: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

const STAGE_LABEL: Record<string, string> = {
  intake: "Pages and format",
  story: "Structure",
  continuity: "Continuity",
};

export default function ProductionPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  return (
    <Suspense fallback={<Loading />}>
      <Production params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Production({ params, searchParams }: { params: Params; searchParams: Search }) {
  await connection();
  const problem = databaseProblem();
  if (problem) return <SetupNeeded problem={problem} />;
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const db = await getDb();
  const run = await loadRun(db, id);
  if (!run) notFound();

  const sp = await searchParams;
  const asked = Number(sp.chapter);
  const chapter = run.chapters[typeof sp.chapter === "string" && Number.isInteger(asked) && asked >= 0 && asked < run.chapters.length ? asked : run.currentChapter];
  const stageId = typeof sp.stage === "string" ? sp.stage : undefined;

  return (
    <div>
      <section className="night-sky px-6 pt-10 pb-16">
        <div className="mx-auto max-w-6xl">
          <Link href="/" className="text-sm text-[#d8d0ec] hover:text-white">
            ← All productions
          </Link>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="font-display text-5xl leading-tight font-semibold">{run.title}</h1>
              <p className="mt-1 text-[#d8d0ec]">
                Begun from a {run.inputKind} · {run.createdAt.slice(0, 10)}
              </p>
            </div>
            {run.greenlit && (
              <span className="font-display flex items-center gap-2 rounded-full border border-[#f2d27e66] px-4 py-1.5 text-xl text-[#f2d27e]">
                <Star className="h-5 w-5" /> Greenlit
              </span>
            )}
          </div>
          <ChapterPath run={run} selected={chapter.index} />
        </div>
      </section>

      <div className="mx-auto -mt-8 max-w-6xl px-6 pb-16">
        <div className="card p-6 sm:p-8">
          <ChapterHeader chapter={chapter} />
          <div className="my-4">
            <RunDriver runId={run.id} active={run.status === "running"} />
          </div>
          <StateBanner run={run} chapter={chapter} />
          <ChapterActions run={run} chapter={chapter} />
          <ChapterBody run={run} chapter={chapter} stageId={stageId} db={db} />
          <Gate run={run} chapter={chapter} />
        </div>
      </div>
    </div>
  );
}

// ---- the path of chapters ---------------------------------------------------------

const STATE_LABEL: Record<ChapterView["state"], string> = {
  locked: "locked",
  awaiting_input: "your move",
  working: "in progress",
  ready: "ready for review",
  approved: "approved",
  skipped: "skipped",
  failed: "needs attention",
};

function ChapterPath({ run, selected }: { run: RunView; selected: number }) {
  return (
    <ol className="relative mt-10 grid grid-cols-3 gap-y-6 sm:grid-cols-6">
      <span aria-hidden className="absolute top-6 right-[8%] left-[8%] hidden border-t border-dashed border-[#f2d27e55] sm:block" />
      {run.chapters.map((c) => {
        const on = c.state === "approved" || c.state === "skipped";
        const current = c.index === run.currentChapter && !run.greenlit;
        const tone = on
          ? "border-[#f2d27e] bg-[#f2d27e] text-[#2a1e05]"
          : current
            ? "twinkle border-[#f2d27e] bg-[#1b2459] text-[#f2d27e]"
            : c.state === "locked"
              ? "border-white/20 bg-[#141a44] text-white/40"
              : "border-[#f2d27e88] bg-[#1b2459] text-[#f2d27e]";
        return (
          <li key={c.id} className="relative flex flex-col items-center text-center">
            <Link
              href={`/runs/${run.id}?chapter=${c.index}`}
              aria-current={c.index === selected ? "step" : undefined}
              aria-label={`Chapter ${c.numeral}: ${c.title} (${STATE_LABEL[c.state]})`}
              className={`relative z-10 flex h-12 w-12 items-center justify-center rounded-full border transition hover:scale-105 ${tone} ${c.index === selected ? "ring-2 ring-white/70 ring-offset-2 ring-offset-[#1b2459]" : ""}`}
            >
              {on ? <Star className="h-6 w-6" /> : <span className="font-display text-xl">{c.numeral}</span>}
            </Link>
            <span className={`mt-2 text-sm ${c.state === "locked" ? "text-white/40" : "text-[#efe8d6]"}`}>{c.title.replace(/^The /, "")}</span>
            <span className="text-xs text-[#b9b2d6]">{STATE_LABEL[c.state]}</span>
          </li>
        );
      })}
    </ol>
  );
}

function ChapterHeader({ chapter }: { chapter: ChapterView }) {
  return (
    <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line pb-4">
      <div>
        <p className="text-xs tracking-[0.3em] text-muted uppercase">Chapter {chapter.numeral}</p>
        <h2 className="font-display text-4xl font-semibold">{chapter.title}</h2>
        <p className="font-display text-lg text-ink-soft italic">{chapter.tagline}</p>
      </div>
      <p className="text-sm text-muted">Signed off by: {chapter.owner}</p>
    </header>
  );
}

function StateBanner({ run, chapter }: { run: RunView; chapter: ChapterView }) {
  const box = (tone: string, children: ReactNode) => <div className={`mb-6 rounded-2xl border px-4 py-3 text-sm ${tone}`}>{children}</div>;
  switch (chapter.state) {
    case "locked":
      return box("border-line bg-paper-2 text-ink-soft", <>This chapter opens once chapter {run.chapters[chapter.index - 1].numeral} is approved.</>);
    case "skipped":
      return box("border-line bg-paper-2 text-ink-soft", <>{chapter.note} To develop a story first, begin a new production from a story.</>);
    case "working":
      return box("border-sky-300/50 bg-sky-50 text-sky-900 dark:bg-sky-950 dark:text-sky-100", <>Working on it{chapter.note ? `: ${chapter.note}` : "…"}</>);
    case "failed":
      return box(
        "border-rose/40 bg-rose/10 text-rose",
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span>{chapter.note}</span>
          <form action={retryFailedRun}>
            <input type="hidden" name="id" value={run.id} />
            <button className="btn-ghost text-sm">Try again</button>
          </form>
        </div>,
      );
    case "ready":
      return box("border-gold/40 bg-gold-soft/50", <>Every test in this chapter has run. Read the reports below, then approve it to open the next chapter.</>);
    default:
      return null;
  }
}

// ---- chapter-specific actions -----------------------------------------------------

function ChapterActions({ run, chapter }: { run: RunView; chapter: ChapterView }) {
  const open = chapter.state !== "approved" && chapter.state !== "locked" && chapter.state !== "skipped";
  if (chapter.id === "story" && run.storyText) {
    return open ? (
      <details className="mb-8">
        <summary className="cursor-pointer font-semibold text-gold">Revise the story and test it again</summary>
        <form action={updateStoryAction} className="mt-3 space-y-3">
          <input type="hidden" name="id" value={run.id} />
          <textarea name="story" rows={12} defaultValue={run.storyText} className="field font-display text-lg leading-snug" />
          <button className="btn-gold">
            <Star /> Test the story again
          </button>
        </form>
      </details>
    ) : (
      <details className="mb-8">
        <summary className="cursor-pointer text-sm text-muted">Read the story as approved</summary>
        <p className="font-display mt-3 text-lg leading-relaxed whitespace-pre-wrap">{run.storyText}</p>
      </details>
    );
  }

  if (chapter.id === "script" && chapter.state === "awaiting_input") {
    return (
      <div className="mb-8 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-gold/50 bg-gold-soft/30 p-5">
          <h3 className="font-display text-2xl font-semibold">Write it from the story</h3>
          <p className="mt-1 mb-4 text-sm text-ink-soft">
            A scene-by-scene screenplay outline, drawn only from what your story says, with no invented dialogue. You can revise it afterwards.
          </p>
          <form action={writeScriptAction}>
            <input type="hidden" name="id" value={run.id} />
            <button className="btn-gold">
              <Star /> Write the screenplay
            </button>
          </form>
        </div>
        <div className="rounded-2xl border border-line p-5">
          <h3 className="font-display text-2xl font-semibold">I have a screenplay</h3>
          <p className="mt-1 mb-3 text-sm text-ink-soft">Upload Fountain, Final Draft or plain text, or paste it.</p>
          <ScriptForm runId={run.id} label="Use my screenplay" />
        </div>
      </div>
    );
  }

  if (chapter.id === "script" && open && run.scriptText) {
    return (
      <div className="mb-8 flex flex-wrap items-start gap-4">
        <details className="min-w-0 flex-1">
          <summary className="cursor-pointer font-semibold text-gold">Revise the screenplay and test it again</summary>
          <div className="mt-3">
            <ScriptForm runId={run.id} label="Test the screenplay again" defaultValue={run.scriptText} />
          </div>
        </details>
        {run.storyText && (
          <form action={writeScriptAction}>
            <input type="hidden" name="id" value={run.id} />
            <button className="btn-ghost text-sm">Write it again from the story</button>
          </form>
        )}
      </div>
    );
  }
  return null;
}

function ScriptForm({ runId, label, defaultValue }: { runId: number; label: string; defaultValue?: string }) {
  return (
    <form action={setScriptAction} className="space-y-3">
      <input type="hidden" name="id" value={runId} />
      <input type="file" name="file" accept=".fountain,.fdx,.txt,.md" className="block w-full text-sm" />
      <textarea name="script" rows={defaultValue ? 16 : 5} defaultValue={defaultValue} placeholder="…or paste it here" className="field font-mono text-xs" />
      <button className="btn-gold">
        <Star /> {label}
      </button>
    </form>
  );
}

// ---- reports ----------------------------------------------------------------------

async function ChapterBody({ run, chapter, stageId, db }: { run: RunView; chapter: ChapterView; stageId?: string; db: Db }) {
  if (chapter.state === "locked" || chapter.state === "awaiting_input") return null;
  const views = chapter.stageViews;
  if (!views.length) return <p className="text-sm text-muted">Not started yet.</p>;
  const current = views.find((s) => s.id === stageId) ?? views.findLast((s) => s.status === "done") ?? views[0];
  return (
    <div>
      {views.length > 1 && (
        <nav className="mb-6 flex flex-wrap gap-2">
          {views.map((s) => (
            <Link
              key={s.id}
              href={`/runs/${run.id}?chapter=${chapter.index}&stage=${s.id}`}
              className={`rounded-full border px-4 py-1.5 text-sm transition ${s.id === current.id ? "border-gold bg-gold-soft font-semibold" : "border-line hover:border-gold"}`}
            >
              {STAGE_LABEL[s.id] ?? s.title}
              {s.status !== "done" && <span className="ml-1.5 text-xs text-muted">({s.status === "running" ? "working" : s.status})</span>}
            </Link>
          ))}
        </nav>
      )}
      <StageReport stage={current} run={run} db={db} />
    </div>
  );
}

async function StageReport({ stage, run, db }: { stage: StageView; run: RunView; db: Db }): Promise<ReactNode> {
  if (stage.status === "failed") return <p className="text-sm text-rose">This step stopped: {stage.error}</p>;
  if (stage.status !== "done" || !stage.report) {
    return (
      <p className="flex items-center gap-2 py-6 text-muted">
        <Star className="h-4 w-4 animate-pulse text-gold" />
        {stage.status === "running" ? (stage.progress ?? "Working…") : "Waiting for the steps before it."}
      </p>
    );
  }
  switch (stage.id) {
    case "story_test":
      return <StoryTestReportView r={stage.report as StoryTestReport | Skipped} />;
    case "intake":
      return <IntakeReportView r={stage.report as IntakeReport} scriptText={run.scriptText} />;
    case "story":
      return <StoryReportView r={stage.report as StoryReport | Skipped} />;
    case "continuity": {
      const r = stage.report as ContinuityReport;
      return <ContinuityReportView r={r} review={await loadReview(db, r.docId)} />;
    }
    case "breakdown":
      return <BreakdownReportView r={stage.report as BreakdownReport} />;
    case "locations":
      return <LocationsReportView r={stage.report as LocationsReport} />;
    case "schedule":
      return <ScheduleReportView r={stage.report as ScheduleReport} />;
    case "budget":
      return <BudgetReportView r={stage.report as BudgetReport} />;
    default:
      return null;
  }
}

// ---- the gate ---------------------------------------------------------------------

function Gate({ run, chapter }: { run: RunView; chapter: ChapterView }) {
  if (chapter.state === "ready") {
    const high = openHighCount(chapter);
    return (
      <div className="mt-10 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-gold/40 bg-gold-soft/40 p-5">
        <div className="text-sm">
          <p className="font-display text-2xl font-semibold">Ready to move on?</p>
          <p className="text-ink-soft">
            {high > 0 ? `${high} high-priority note${high > 1 ? "s are" : " is"} still open. You can approve anyway; the reports stay with the production.` : "No high-priority notes are open."}
          </p>
        </div>
        <form action={approveChapterAction}>
          <input type="hidden" name="id" value={run.id} />
          <input type="hidden" name="chapter" value={chapter.index} />
          <button className="btn-gold text-base">
            <Star /> {chapter.approveLabel}
          </button>
        </form>
      </div>
    );
  }
  if (chapter.state === "approved") {
    const later = run.chapters.slice(chapter.index + 1).some((c) => c.state !== "locked" && c.state !== "skipped");
    return (
      <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-5 text-sm">
        <span className="flex items-center gap-2 text-gold">
          <Star /> Approved
        </span>
        <form action={reopenChapterAction}>
          <input type="hidden" name="id" value={run.id} />
          <input type="hidden" name="chapter" value={chapter.index} />
          <button className="btn-ghost text-sm">Reopen this chapter{later ? " (resets the chapters after it)" : ""}</button>
        </form>
      </div>
    );
  }
  return null;
}
