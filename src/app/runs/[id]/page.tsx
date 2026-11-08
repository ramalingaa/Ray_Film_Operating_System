import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArrowRight, Check, LoaderCircle, PenLine, RotateCcw, Upload } from "lucide-react";
import { approveChapterAction, reopenChapterAction, retryFailedRun, setScriptAction, updateStoryAction, writeScriptAction } from "@/app/actions";
import { STAGE_LOOK, StarMark } from "@/components/journey/stage-look";
import { StageRail } from "@/components/journey/stage-rail";
import { Loading, SetupNeeded } from "@/components/nav";
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
import { summaryOf, TEST_LABEL } from "@/lib/ui/summaries";

/** Each step a production takes is a server action on this page; it saves progress well before this limit. */
export const maxDuration = 300;

type Params = Promise<{ id: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

const PILL: Record<ChapterView["state"], string> = {
  ready: "Ready for your review",
  working: "Working on it",
  awaiting_input: "Your move",
  failed: "Needs attention",
  approved: "Approved",
  skipped: "Skipped",
  locked: "Locked",
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
  const current = run.chapters[run.currentChapter];
  const curLook = STAGE_LOOK[current.id];
  const stageId = typeof sp.stage === "string" ? sp.stage : undefined;

  return (
    <div>
      {/* production strip */}
      <section className="bg-ink-2 px-6 py-7 text-on-ink sm:px-8">
        <div className="mx-auto flex max-w-[1320px] flex-wrap items-end justify-between gap-5">
          <div>
            <Link href="/" className="text-sm text-on-ink-2 no-underline hover:text-on-ink">
              ← All productions
            </Link>
            <h1 className="font-display mt-2 text-[46px] leading-none font-semibold">{run.title}</h1>
            <p className="mt-2 text-sm text-on-ink-2">
              Begun from a {run.inputKind} · {run.createdAt.slice(0, 10)}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {run.greenlit ? (
              <span className="font-display inline-flex items-center gap-2 rounded-full bg-gold-bright px-4 py-1.5 text-xl font-semibold text-[#1F1703]">
                <StarMark size={18} /> Greenlit
              </span>
            ) : (
              <>
                <span className="text-sm text-on-ink-2">
                  Step {run.currentChapter + 1} of {run.chapters.length}
                </span>
                <span className="inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-sm font-semibold" style={{ background: curLook.onInkBg, color: curLook.onInkFg }}>
                  <span aria-hidden className={`h-2 w-2 rounded-full ${current.state === "working" ? "pulse" : ""}`} style={{ background: curLook.onInkFg }} />
                  {PILL[current.state]}
                </span>
              </>
            )}
          </div>
        </div>
      </section>

      <div className="mx-auto flex max-w-[1320px] flex-wrap items-start gap-8 px-6 pt-9 pb-24 sm:px-8">
        <StageRail run={run} selected={chapter.index} />

        <div className="flex min-w-0 flex-[999_1_640px] flex-col gap-6">
          <RunDriver runId={run.id} active={run.status === "running"} silent />
          <StageHeader run={run} chapter={chapter} />
          <StatePanel run={run} chapter={chapter} />
          <Revise run={run} chapter={chapter} />
          <Reports run={run} chapter={chapter} stageId={stageId} db={db} />
          <Decision run={run} chapter={chapter} />
        </div>
      </div>
    </div>
  );
}

// ---- stage header ----------------------------------------------------------------

function StageHeader({ run, chapter }: { run: RunView; chapter: ChapterView }) {
  const look = STAGE_LOOK[chapter.id];
  const tested = chapter.stageViews.filter((s) => s.status === "done" && s.report && !("skipped" in (s.report as object)));
  return (
    <section className="card flex flex-wrap items-start justify-between gap-6 p-8">
      <div className="flex min-w-0 flex-[1_1_420px] items-start gap-5.5">
        <span className="inline-flex h-[72px] w-[72px] flex-none items-center justify-center rounded-[20px] text-white" style={{ background: chapter.state === "locked" ? "#CFC6B1" : look.base }}>
          <look.Icon aria-hidden size={32} strokeWidth={1.8} />
        </span>
        <div>
          <p className="eyebrow" style={{ color: look.deep }}>
            Step {chapter.index + 1} of {run.chapters.length}
          </p>
          <h2 className="font-display mt-1.5 text-[56px] leading-none font-semibold">{chapter.title}</h2>
          <p className="font-display mt-2 text-[22px] text-fg-2 italic">{chapter.tagline}</p>
        </div>
      </div>
      <span className="text-[13px] text-muted">Signed off by {look.signer}</span>

      {chapter.stageViews.length > 0 && chapter.state !== "locked" && chapter.state !== "skipped" && chapter.state !== "awaiting_input" && (
        <div className="grid w-full grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3 border-t border-line-2 pt-5.5">
          {chapter.stageViews.map((s) => (
            <CheckTile key={s.id} stage={s} color={look} />
          ))}
        </div>
      )}
      {tested.length > 0 && (
        <p className="w-full text-[13px] text-muted">Every finding below quotes the line it came from. Points whose quote could not be found are left out and listed.</p>
      )}
    </section>
  );
}

function CheckTile({ stage, color }: { stage: StageView; color: (typeof STAGE_LOOK)[keyof typeof STAGE_LOOK] }) {
  const status = stage.status;
  const icon =
    status === "done" ? (
      <span className="inline-flex h-7.5 w-7.5 flex-none items-center justify-center rounded-full bg-ok text-white">
        <Check aria-hidden size={16} strokeWidth={2.6} />
      </span>
    ) : status === "running" ? (
      <span className="inline-flex h-7.5 w-7.5 flex-none items-center justify-center rounded-full" style={{ background: color.soft, color: color.deep }}>
        <LoaderCircle aria-hidden size={16} strokeWidth={2.4} className="spin" />
      </span>
    ) : status === "failed" ? (
      <span className="inline-flex h-7.5 w-7.5 flex-none items-center justify-center rounded-full bg-rose-soft font-bold text-rose">!</span>
    ) : (
      <span className="inline-flex h-7.5 w-7.5 flex-none rounded-full border border-line bg-paper-2" />
    );
  const detail = status === "done" ? summaryOf(stage) : status === "running" ? (stage.progress ?? "Working…") : status === "failed" ? "Stopped" : "Waiting";
  return (
    <div className="flex items-center gap-3 rounded-2xl p-3.5" style={{ background: status === "done" ? "var(--ok-soft)" : status === "failed" ? "var(--rose-soft)" : "var(--paper-2)" }}>
      {icon}
      <div className="flex min-w-0 flex-col">
        <span className="text-sm font-semibold">{TEST_LABEL[stage.id] ?? stage.title}</span>
        <span className="text-[13px] text-fg-2">{detail}</span>
      </div>
    </div>
  );
}

// ---- state panels -----------------------------------------------------------------

function StatePanel({ run, chapter }: { run: RunView; chapter: ChapterView }) {
  const look = STAGE_LOOK[chapter.id];
  switch (chapter.state) {
    case "locked": {
      const cur = run.chapters[run.currentChapter];
      return (
        <section className="card flex flex-wrap items-center justify-between gap-4 p-7">
          <p className="text-[15px] text-fg-2">
            This stage opens once <strong className="text-fg">{run.chapters[chapter.index - 1].title}</strong> is approved.
          </p>
          <Link href={`/runs/${run.id}?chapter=${cur.index}`} className="btn-ghost">
            Go to step {cur.index + 1}, {cur.title} <ArrowRight aria-hidden size={16} />
          </Link>
        </section>
      );
    }
    case "skipped":
      return (
        <section className="card p-7 text-[15px] text-fg-2">
          This production began from a screenplay, so there was no story to test. To develop a story first,{" "}
          <Link href="/new?from=story" className="font-semibold text-gold-deep">
            start a new production from a story
          </Link>
          .
        </section>
      );
    case "failed":
      return (
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-[26px] border border-rose/30 bg-rose-soft p-7">
          <div>
            <p className="font-display text-[28px] font-semibold text-rose">This stage needs attention</p>
            <p className="mt-1 max-w-[720px] text-[15px] text-fg-2">{chapter.note}</p>
          </div>
          <form action={retryFailedRun}>
            <input type="hidden" name="id" value={run.id} />
            <button className="btn-dark">
              <RotateCcw aria-hidden size={16} /> Try again
            </button>
          </form>
        </section>
      );
    case "awaiting_input":
      return <ScriptChoice run={run} />;
    case "working":
      return <Working chapter={chapter} look={look} />;
    default:
      return null;
  }
}

function Working({ chapter, look }: { chapter: ChapterView; look: (typeof STAGE_LOOK)[keyof typeof STAGE_LOOK] }) {
  const views = chapter.stageViews;
  const done = views.filter((s) => s.status === "done").length;
  const pct = views.length > 1 ? (done / (views.length - 1)) * 100 : 0;
  return (
    <section className="card p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="font-display text-[38px] font-semibold">Testing {chapter.title.toLowerCase()}</h3>
        <span className="text-sm text-muted">
          {done} of {views.length} done
        </span>
      </div>
      <p className="mt-1.5 text-[15px] text-fg-2">Keep this page open. If you close it, the work picks up where it left off when you come back.</p>

      {views.length > 1 && (
        <div className="relative mt-8">
          <div aria-hidden className="absolute top-[27px] h-[3px] rounded" style={{ left: `${50 / views.length}%`, right: `${50 / views.length}%`, background: "var(--line)" }} />
          <div
            aria-hidden
            className="absolute top-[27px] h-[3px] rounded"
            style={{ left: `${50 / views.length}%`, width: `${Math.min(100, pct) * ((views.length - 1) / views.length)}%`, background: look.base }}
          />
          <ol className="relative grid gap-4" style={{ gridTemplateColumns: `repeat(${views.length}, minmax(0, 1fr))` }}>
            {views.map((s) => (
              <li key={s.id} className="flex flex-col items-center gap-2.5 text-center">
                <span
                  className="inline-flex h-14 w-14 items-center justify-center rounded-full shadow-[0_0_0_6px_var(--card)]"
                  style={s.status === "done" ? { background: "var(--ok)", color: "#fff" } : s.status === "running" ? { background: look.soft, color: look.deep } : { background: "var(--paper-2)", color: "#8B8EA3" }}
                >
                  {s.status === "done" ? <Check aria-hidden size={24} strokeWidth={2.6} /> : s.status === "running" ? <LoaderCircle aria-hidden size={24} className="spin" /> : null}
                </span>
                <span className="text-base font-semibold">{TEST_LABEL[s.id] ?? s.title}</span>
                <span className="text-sm" style={{ color: s.status === "running" ? look.deep : "var(--fg-2)", fontWeight: s.status === "running" ? 600 : 400 }}>
                  {s.status === "done" ? summaryOf(s) : s.status === "running" ? (s.progress ?? "Working…") : "Next"}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
      {views.length === 1 && (
        <p className="mt-6 flex items-center gap-3 text-[15px] font-semibold" style={{ color: look.deep }}>
          <LoaderCircle aria-hidden size={20} className="spin" /> {views[0].progress ?? "Reading…"}
        </p>
      )}

      {done > 0 && (
        <div className="mt-8 border-t border-line-2 pt-5">
          <p className="eyebrow mb-3 text-muted">What just happened</p>
          <ol className="flex flex-col gap-2.5 text-sm">
            {views
              .filter((s) => s.status === "done")
              .map((s) => (
                <li key={s.id} className="flex gap-3.5">
                  <span className="w-13 flex-none font-mono text-[#8B8EA3]">{s.finishedAt?.slice(11, 16) ?? ""}</span>
                  <span>
                    <strong>{TEST_LABEL[s.id] ?? s.title}:</strong> {summaryOf(s)}
                  </span>
                </li>
              ))}
          </ol>
        </div>
      )}
    </section>
  );
}

function ScriptChoice({ run }: { run: RunView }) {
  const look = STAGE_LOOK.script;
  return (
    <section className="flex flex-col gap-4.5">
      <div>
        <h3 className="font-display text-[38px] font-semibold">How should the screenplay be made?</h3>
        <p className="mt-1.5 text-base text-fg-2">Your story is locked. Pick one; you can change your mind until you lock the script.</p>
      </div>
      <div className="flex flex-wrap gap-5">
        <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-3.5 rounded-[26px] border-2 bg-card p-7.5" style={{ borderColor: look.base }}>
          <div className="flex items-center justify-between">
            <span className="inline-flex h-13 w-13 items-center justify-center rounded-2xl" style={{ background: look.soft, color: look.deep }}>
              <PenLine aria-hidden size={24} strokeWidth={1.8} />
            </span>
            <span className="rounded-full px-3 py-1.5 text-xs font-bold tracking-wider" style={{ background: look.soft, color: look.deep }}>
              RECOMMENDED
            </span>
          </div>
          <span className="font-display text-[34px] leading-[1.05] font-semibold">Write it from my story</span>
          <ul className="flex flex-col gap-2.5 text-[15px] leading-normal text-fg-2">
            {["A scene-by-scene outline in screenplay format", "Every scene traced to a passage of your story", "No invented dialogue; you revise it afterwards"].map((t) => (
              <li key={t} className="flex gap-2.5">
                <Check aria-hidden size={16} strokeWidth={2.6} className="mt-1 flex-none text-ok" />
                {t}
              </li>
            ))}
          </ul>
          <form action={writeScriptAction} className="mt-2">
            <input type="hidden" name="id" value={run.id} />
            <button className="btn-dark">
              Write the screenplay <ArrowRight aria-hidden size={18} />
            </button>
          </form>
        </div>

        <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-3.5 rounded-[26px] border border-line bg-card p-7.5">
          <span className="inline-flex h-13 w-13 items-center justify-center rounded-2xl bg-paper-2 text-fg-2">
            <Upload aria-hidden size={24} strokeWidth={1.8} />
          </span>
          <span className="font-display text-[34px] leading-[1.05] font-semibold">Use my own screenplay</span>
          <ScriptForm runId={run.id} label="Use this screenplay" />
        </div>
      </div>
    </section>
  );
}

function ScriptForm({ runId, label, defaultValue }: { runId: number; label: string; defaultValue?: string }) {
  return (
    <form action={setScriptAction} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={runId} />
      <label className="relative flex h-[120px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[18px] border-2 border-dashed border-[#CFC6B1] bg-[#FAF7F0] text-center text-fg-2">
        <span className="text-[15px] font-semibold text-fg">Choose a file</span>
        <span className="text-[13px]">Fountain, Final Draft or plain text</span>
        <input type="file" name="file" accept=".fountain,.fdx,.txt,.md" className="absolute inset-0 cursor-pointer opacity-0" />
      </label>
      <textarea name="script" rows={defaultValue ? 16 : 4} defaultValue={defaultValue} placeholder="…or paste it here" className="field font-mono text-xs" />
      <button className="btn-ghost self-start">{label}</button>
    </form>
  );
}

function Revise({ run, chapter }: { run: RunView; chapter: ChapterView }) {
  const open = chapter.state === "ready" || chapter.state === "failed" || chapter.state === "working";
  if (!open) return null;
  if (chapter.id === "story" && run.storyText) {
    return (
      <details id="revise" className="card p-7">
        <summary className="font-display cursor-pointer text-[26px] font-semibold">Revise the story and test it again</summary>
        <form action={updateStoryAction} className="mt-4 flex flex-col gap-3">
          <input type="hidden" name="id" value={run.id} />
          <textarea name="story" rows={12} defaultValue={run.storyText} className="field font-display rounded-[18px]! text-[21px] leading-[1.55]" />
          <button className="btn-dark self-start">Test the story again</button>
        </form>
      </details>
    );
  }
  if (chapter.id === "script" && run.scriptText) {
    return (
      <details id="revise" className="card p-7">
        <summary className="font-display cursor-pointer text-[26px] font-semibold">Revise the screenplay and test it again</summary>
        <div className="mt-4 flex flex-col gap-4">
          <ScriptForm runId={run.id} label="Test the screenplay again" defaultValue={run.scriptText} />
          {run.storyText && (
            <form action={writeScriptAction}>
              <input type="hidden" name="id" value={run.id} />
              <button className="text-sm font-semibold text-gold-deep underline underline-offset-4">Or write it again from the story</button>
            </form>
          )}
        </div>
      </details>
    );
  }
  return null;
}

// ---- reports ----------------------------------------------------------------------

async function Reports({ run, chapter, stageId, db }: { run: RunView; chapter: ChapterView; stageId?: string; db: Db }) {
  if (chapter.state === "locked" || chapter.state === "skipped" || chapter.state === "awaiting_input") return null;
  const done = chapter.stageViews.filter((s) => s.status === "done");
  if (!done.length) return null;
  const look = STAGE_LOOK[chapter.id];
  const current = done.find((s) => s.id === stageId) ?? done[done.length - 1];
  return (
    <section className="flex flex-col gap-5">
      {chapter.stageViews.length > 1 && (
        <nav aria-label="Reports in this stage" className="flex flex-wrap gap-2">
          {chapter.stageViews.map((s) =>
            s.status === "done" ? (
              <Link
                key={s.id}
                href={`/runs/${run.id}?chapter=${chapter.index}&stage=${s.id}`}
                aria-current={s.id === current.id ? "page" : undefined}
                className="rounded-full border px-4.5 py-2 text-sm font-semibold no-underline transition"
                style={s.id === current.id ? { background: look.soft, borderColor: look.base, color: look.deep } : { borderColor: "var(--line)", color: "var(--fg)", background: "var(--card)" }}
              >
                {TEST_LABEL[s.id] ?? s.title}
              </Link>
            ) : (
              <span key={s.id} className="rounded-full border border-line px-4.5 py-2 text-sm text-muted">
                {TEST_LABEL[s.id] ?? s.title} · {s.status === "running" ? "working" : "waiting"}
              </span>
            ),
          )}
        </nav>
      )}
      <StageReport stage={current} run={run} db={db} />
    </section>
  );
}

async function StageReport({ stage, run, db }: { stage: StageView; run: RunView; db: Db }): Promise<ReactNode> {
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

// ---- decision ---------------------------------------------------------------------

function Decision({ run, chapter }: { run: RunView; chapter: ChapterView }) {
  if (chapter.state === "ready") {
    const high = openHighCount(chapter);
    const next = run.chapters[chapter.index + 1];
    const label = next ? `${chapter.approveLabel} and continue to ${next.title.replace(/^The /, "the ")}` : chapter.approveLabel;
    return (
      <section className="flex flex-wrap items-center justify-between gap-5 rounded-[26px] bg-ink px-7.5 py-6.5 text-on-ink">
        <div>
          <p className="font-display text-[30px] font-semibold">Ready to move on?</p>
          <p className="mt-1 text-sm text-on-ink-2">
            {high > 0 ? `${high} high-priority note${high > 1 ? "s are" : " is"} open.` : "No high-priority notes are open."} You can approve with notes open; they stay with the production.
          </p>
        </div>
        <form action={approveChapterAction}>
          <input type="hidden" name="id" value={run.id} />
          <input type="hidden" name="chapter" value={chapter.index} />
          <button className="btn-gold min-h-[52px]!">
            {next ? label : <><StarMark size={18} /> {label}</>}
            {next && <ArrowRight aria-hidden size={18} />}
          </button>
        </form>
      </section>
    );
  }
  if (chapter.state === "approved") {
    const later = run.chapters.slice(chapter.index + 1).some((c) => c.state !== "locked" && c.state !== "skipped");
    const isLast = chapter.index === run.chapters.length - 1;
    return (
      <section className="card flex flex-wrap items-center justify-between gap-4 px-7.5 py-5.5">
        <span className="flex items-center gap-2.5 text-[15px] font-semibold text-ok">
          <Check aria-hidden size={18} strokeWidth={2.6} /> {isLast ? "Approved. This production is greenlit." : "Approved"}
        </span>
        <form action={reopenChapterAction}>
          <input type="hidden" name="id" value={run.id} />
          <input type="hidden" name="chapter" value={chapter.index} />
          <button className="btn-ghost min-h-11! text-sm!">
            <RotateCcw aria-hidden size={15} /> Reopen this stage{later ? " (re-checks every stage after it)" : ""}
          </button>
        </form>
      </section>
    );
  }
  return null;
}
