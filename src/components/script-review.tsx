"use client";

import { useEffect, useState } from "react";
import { dismissFinding, flagFinding, reopenFinding } from "@/app/actions";
import type { FindingStatus, FindingView, SceneView, Severity } from "@/lib/ui/queries";

const SEVERITY: Record<Severity, { label: string; hint: string; badge: string; ring: string }> = {
  high: { label: "High", hint: "Likely visible on screen", badge: "bg-red-100 text-rose dark:bg-red-950 dark:text-red-200", ring: "ring-red-400" },
  medium: { label: "Medium", hint: "Worth checking", badge: "bg-amber-soft text-amber dark:bg-amber-950 dark:text-amber-200", ring: "ring-amber-400" },
  low: { label: "Low", hint: "Minor or paperwork", badge: "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200", ring: "ring-zinc-400" },
};

const FILTERS: { id: "active" | FindingStatus | "all"; label: string }[] = [
  { id: "active", label: "To review" },
  { id: "follow_up", label: "Follow-up" },
  { id: "dismissed_intentional", label: "Dismissed" },
  { id: "all", label: "All" },
];

const lineId = (n: number) => `line-${n}`;

export function ScriptReview({ scenes, findings }: { scenes: SceneView[]; findings: FindingView[] }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("active");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const visible = findings.filter((f) => (filter === "all" ? true : filter === "active" ? f.status === "open" : f.status === filter));
  // A finding that leaves the current list (e.g. just dismissed) stops highlighting the script.
  const selected = visible.find((f) => f.id === selectedId);
  const highlighted = new Set(selected?.sources.filter((s) => s.isScript).map((s) => s.line) ?? []);
  const selectedScenes = new Set(selected?.sceneNumbers ?? []);

  useEffect(() => {
    if (!selected) return;
    const first = Math.min(...selected.sources.filter((s) => s.isScript).map((s) => s.line));
    if (Number.isFinite(first)) document.getElementById(lineId(first))?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [selected]);

  const count = (id: (typeof FILTERS)[number]["id"]) =>
    findings.filter((f) => (id === "all" ? true : id === "active" ? f.status === "open" : f.status === id)).length;

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]">
      {/* Script */}
      <section aria-label="Script" className="min-h-0 overflow-y-auto border-line px-4 py-4 lg:border-r dark:border-zinc-800">
        {scenes.map((scene) => (
          <article
            key={scene.number}
            className={`mb-6 rounded-lg ${selectedScenes.has(scene.number) ? "bg-amber-soft/60 dark:bg-amber-950/20" : ""}`}
          >
            <header className="sticky top-0 z-10 flex items-baseline gap-3 bg-white/95 py-1 backdrop-blur dark:bg-zinc-950/95">
              <span className="rounded bg-zinc-900 px-2 py-0.5 text-xs font-semibold text-white dark:bg-paper-2 dark:text-zinc-900">Scene {scene.number}</span>
              <span className="font-mono text-sm font-semibold">{scene.heading}</span>
              {scene.isFlashback && <span className="text-xs text-violet-700 dark:text-violet-300">flashback</span>}
            </header>
            <pre className="font-mono text-[13px] leading-6 whitespace-pre-wrap">
              {scene.lines.map((text, i) => {
                const n = scene.startLine + i;
                const hit = highlighted.has(n);
                return (
                  <div key={n} id={lineId(n)} className={`flex ${hit ? "rounded bg-amber-200 dark:bg-amber-800/60" : ""}`}>
                    <span className="w-12 shrink-0 pr-3 text-right text-muted select-none">{n}</span>
                    <span className="min-w-0">{text || " "}</span>
                  </div>
                );
              })}
            </pre>
          </article>
        ))}
      </section>

      {/* Findings */}
      <section aria-label="Findings" className="flex min-h-0 flex-col border-t border-line lg:border-t-0 dark:border-zinc-800">
        <div className="flex gap-1 border-b border-line px-3 py-2 dark:border-zinc-800" role="tablist">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-md px-3 py-1.5 text-sm ${filter === f.id ? "bg-fg text-ivory dark:bg-paper-2 dark:text-zinc-900" : "hover:bg-paper-2 dark:hover:bg-zinc-800"}`}
            >
              {f.label} <span className="opacity-60">{count(f.id)}</span>
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {visible.length === 0 && (
            <p className="px-2 py-8 text-center text-sm text-muted">
              {filter === "active" ? "Nothing left to review. Every conflict is dismissed or flagged." : "No findings here."}
            </p>
          )}
          {(["high", "medium", "low"] as Severity[]).map((sev) => {
            const group = visible.filter((f) => f.severity === sev);
            if (!group.length) return null;
            return (
              <div key={sev} className="mb-5">
                <h2 className="mb-2 flex items-baseline gap-2 px-1 text-xs font-semibold tracking-wide text-muted uppercase">
                  {SEVERITY[sev].label} <span className="font-normal normal-case">· {SEVERITY[sev].hint} · {group.length}</span>
                </h2>
                <ul className="space-y-2">
                  {group.map((f) => (
                    <li key={f.id}>
                      <FindingCard finding={f} selected={f.id === selectedId} onSelect={() => setSelectedId(f.id === selectedId ? null : f.id)} />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function FindingCard({ finding: f, selected, onSelect }: { finding: FindingView; selected: boolean; onSelect: () => void }) {
  const sev = SEVERITY[f.severity];
  return (
    <div className={`rounded-lg border border-line bg-white dark:border-zinc-800 dark:bg-zinc-900 ${selected ? `ring-2 ${sev.ring}` : ""}`}>
      <button onClick={onSelect} aria-expanded={selected} className="w-full px-3 py-2.5 text-left">
        <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
          <span className={`rounded px-1.5 py-0.5 font-medium ${sev.badge}`}>{sev.label}</span>
          <span className="text-muted">{f.checkTitle}</span>
          <span className="text-muted">· scene {f.sceneNumbers.join(", ")}</span>
          {f.status === "follow_up" && <span className="rounded bg-sky-100 px-1.5 py-0.5 text-sky-900 dark:bg-sky-950 dark:text-sky-200">follow-up</span>}
          {f.status === "dismissed_intentional" && <span className="rounded bg-paper-2 px-1.5 py-0.5 text-fg-2 dark:bg-zinc-800 dark:text-zinc-300">intentional</span>}
        </div>
        <p className="text-sm font-medium">{f.title}</p>
      </button>

      {selected && (
        <div className="space-y-3 border-t border-line-2 px-3 py-3 text-sm dark:border-zinc-800">
          <p className="leading-relaxed text-fg-2 dark:text-zinc-300">{f.explanation}</p>

          <div>
            <h3 className="mb-1 text-xs font-semibold text-muted uppercase">Where this comes from</h3>
            <ul className="space-y-1.5">
              {f.sources.map((s, i) => (
                <li key={i} className="rounded border border-line bg-paper-2 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-950">
                  <div className="text-xs text-muted">
                    {s.isScript ? "Script" : s.docKind === "costume_sheet" ? "Costume sheet" : s.docKind === "location_sheet" ? "Location sheet" : s.docName}, line {s.line}
                    {s.isScript && (
                      <a href={`#${lineId(s.line)}`} className="ml-2 underline">
                        show
                      </a>
                    )}
                  </div>
                  <div className="font-mono text-[12px]">{s.text.trim() || s.snippet}</div>
                </li>
              ))}
            </ul>
          </div>

          {f.dismissReason && <p className="text-xs text-muted">Dismissed because: {f.dismissReason}</p>}

          {f.status === "open" ? (
            <div className="flex flex-col gap-2">
              <form action={dismissFinding} className="flex gap-2">
                <input type="hidden" name="id" value={f.id} />
                <input
                  name="reason"
                  placeholder="Why it's intentional (optional)"
                  aria-label="Reason for dismissing"
                  className="min-w-0 flex-1 rounded border border-line bg-transparent px-2 py-1 text-sm dark:border-zinc-700"
                />
                <button className="rounded bg-zinc-900 px-3 py-1 text-sm text-white dark:bg-paper-2 dark:text-zinc-900">Dismiss as intentional</button>
              </form>
              <form action={flagFinding}>
                <input type="hidden" name="id" value={f.id} />
                <button className="rounded border border-line px-3 py-1 text-sm dark:border-zinc-700">Flag for follow-up</button>
              </form>
            </div>
          ) : (
            <form action={reopenFinding}>
              <input type="hidden" name="id" value={f.id} />
              <button className="rounded border border-line px-3 py-1 text-sm dark:border-zinc-700">Reopen</button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
