"use client";

import { useState } from "react";
import { ArrowRight, Upload } from "lucide-react";
import { startRun } from "@/app/actions";
import { CHAPTERS } from "@/lib/stages/chapters";
import { STAGE_LOOK } from "./stage-look";

type Mode = "story" | "screenplay";

const TIPS: Record<Mode, { title: string; body: string }[]> = {
  story: [
    { title: "Who it is about", body: "One person we follow, in a sentence." },
    { title: "What they want", body: "A goal we can see them chase." },
    { title: "What stands in the way", body: "A person, a place, or themselves." },
    { title: "How it ends", body: "Even a rough ending lets us check the payoffs." },
  ],
  screenplay: [
    { title: "Pages and running time", body: "Scenes measured in eighths, the unit schedules use." },
    { title: "Structure", body: "Beats, scene cards, and scenes that do not turn." },
    { title: "Continuity", body: "Eight checks, each citing the exact lines that disagree." },
    { title: "You decide", body: "Lock the script to open the breakdown." },
  ],
};

export function StartForm({ initial, samples }: { initial: Mode; samples: { story: React.ReactNode; screenplay: React.ReactNode } }) {
  const [mode, setMode] = useState<Mode>(initial);
  const [words, setWords] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isStory = mode === "story";
  const look = STAGE_LOOK[isStory ? "story" : "script"];
  const stepIndex = isStory ? 0 : 1;

  const tab = (m: Mode, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={mode === m}
      onClick={() => {
        setMode(m);
        setFileName(null);
      }}
      className={`h-11 cursor-pointer rounded-full px-5.5 text-[15px] font-semibold transition ${mode === m ? "bg-fg text-ivory" : "text-fg-2 hover:text-fg"}`}
    >
      {label}
    </button>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3.5">
        <span className="eyebrow text-muted">New production</span>
        <div aria-hidden className="flex items-center gap-1.5">
          {CHAPTERS.map((c, i) => (
            <span key={c.id} className="h-1.5 w-7 rounded-full" style={{ background: i === stepIndex ? STAGE_LOOK[c.id].base : i < stepIndex ? "#C9BFA7" : "var(--line)" }} />
          ))}
        </div>
        <span className="text-sm font-semibold" style={{ color: look.deep }}>
          Starting at step {stepIndex + 1} · {CHAPTERS[stepIndex].title}
        </span>
      </div>

      <div role="tablist" aria-label="What are you starting with?" className="mt-7 inline-flex gap-1.5 rounded-full bg-[#EDE6D6] p-1.5">
        {tab("story", "A story")}
        {tab("screenplay", "A screenplay")}
      </div>

      <div className="mt-7 flex flex-wrap items-start gap-10">
        <form action={startRun} onSubmit={() => setBusy(true)} className="flex min-w-0 flex-[999_1_640px] flex-col gap-4">
          <h1 className="font-display text-[60px] leading-[1.02] font-semibold">{isStory ? "Tell us the story." : "Bring the screenplay."}</h1>
          <p className="-mt-1 max-w-[620px] text-[17px] leading-relaxed text-fg-2">
            {isStory
              ? "A logline is enough to begin. A few paragraphs gives the test more to work with. You can revise it as often as you like before you lock it."
              : "You will start at step 2. We measure pages and running time, read the structure, and run the eight continuity checks before anything else."}
          </p>

          <label className="mt-4 flex flex-col gap-2 text-sm font-semibold">
            {isStory ? "Working title" : "Title (taken from the file if left empty)"}
            <input name="title" className="field h-[52px] text-[17px] font-normal" placeholder={isStory ? "The Night Ferry" : "The Keeper’s Ledger"} />
          </label>

          {isStory ? (
            <>
              <label className="flex flex-col gap-2 text-sm font-semibold">
                The story
                <textarea
                  name="text"
                  rows={11}
                  onChange={(e) => setWords(e.target.value.trim() ? e.target.value.trim().split(/\s+/).length : 0)}
                  placeholder="Asha, a tired ferry captain, runs the last night crossing across a stormy bay…"
                  className="field font-display resize-y rounded-[18px]! px-5.5! py-5! text-[23px] leading-[1.55] font-normal"
                />
              </label>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <label className="relative inline-flex h-12 cursor-pointer items-center gap-2.5 rounded-full border border-dashed border-[#C9BFA7] px-4.5 text-sm text-fg-2">
                  <Upload aria-hidden size={18} />
                  {fileName ?? "Or upload a file (.txt, .md)"}
                  <input type="file" name="file" accept=".txt,.md,.text" onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)} className="absolute inset-0 cursor-pointer opacity-0" />
                </label>
                <span className="text-[13px] text-muted">
                  {words} word{words === 1 ? "" : "s"} · about 400 or more lets us time the beats
                </span>
              </div>
            </>
          ) : (
            <>
              <label
                className="relative flex h-[220px] cursor-pointer flex-col items-center justify-center gap-3 rounded-[22px] border-2 border-dashed text-center"
                style={{ borderColor: "#B9C9EE", background: "#F1F5FD", color: look.deep }}
              >
                <Upload aria-hidden size={36} strokeWidth={1.6} />
                <span className="text-lg font-semibold">{fileName ?? "Drop the screenplay here, or choose a file"}</span>
                <span className="text-sm text-fg-2">Fountain (.fountain), Final Draft (.fdx) or plain text</span>
                <input type="file" name="file" accept=".fountain,.fdx,.txt,.md" onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)} className="absolute inset-0 cursor-pointer opacity-0" />
              </label>
              <details className="text-[15px] text-fg-2">
                <summary className="cursor-pointer py-2 font-semibold text-fg">Or paste it</summary>
                <textarea name="text" rows={7} placeholder="INT. HARBOR OFFICE - NIGHT" className="field mt-2 font-mono text-[13px]" />
              </details>
              <details className="text-[15px] text-fg-2">
                <summary className="cursor-pointer py-2 font-semibold text-fg">Add costume and location sheets (optional)</summary>
                <p className="mt-1.5">They let us check the screenplay against what wardrobe and locations already have.</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1.5 text-sm">
                    Costume sheet (.csv)
                    <input type="file" name="costumes" accept=".csv" className="text-sm" />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm">
                    Location sheet (.csv)
                    <input type="file" name="locations" accept=".csv" className="text-sm" />
                  </label>
                </div>
              </details>
            </>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-4">
            <button className="btn-dark min-h-14! px-7! text-base!" disabled={busy}>
              {busy ? "Starting…" : isStory ? "Test my story" : "Check my screenplay"} <ArrowRight aria-hidden size={18} />
            </button>
            <span className="text-sm text-muted">{isStory ? "Takes about a minute." : "A 10-scene script takes two to three minutes."}</span>
          </div>
        </form>

        <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
          <div className="rounded-[22px] border border-line bg-card p-6.5">
            <p className="eyebrow mb-3.5 text-muted">{isStory ? "What helps the test" : "What happens next"}</p>
            {TIPS[mode].map((t, i) => (
              <div key={t.title} className="flex gap-3 border-t border-line-2 py-2.5">
                <span className="inline-flex h-6.5 w-6.5 flex-none items-center justify-center rounded-full text-[13px] font-bold" style={{ background: look.soft, color: look.deep }}>
                  {i + 1}
                </span>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[15px] font-semibold">{t.title}</span>
                  <span className="text-sm leading-normal text-fg-2">{t.body}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="rounded-[22px] bg-ink p-6.5 text-on-ink">
            <p className="font-display text-[26px] leading-tight font-semibold">Just exploring?</p>
            <p className="mt-2 mb-4 text-sm leading-normal text-on-ink-2">Open a sample and walk through every stage.</p>
            {isStory ? samples.story : samples.screenplay}
          </div>
        </aside>
      </div>
    </div>
  );
}
