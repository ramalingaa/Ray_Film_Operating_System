import type { ReactNode } from "react";

const STATUS_TONE: Record<string, string> = {
  done: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  running: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  queued: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  pending: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={`rounded px-1.5 py-0.5 text-xs ${STATUS_TONE[status] ?? STATUS_TONE.pending}`}>{status}</span>;
}

export const SEVERITY_TONE = {
  high: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  medium: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  low: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
} as const;

export function SeverityBadge({ severity }: { severity: keyof typeof SEVERITY_TONE }) {
  return <span className={`rounded px-1.5 py-0.5 text-xs uppercase ${SEVERITY_TONE[severity]}`}>{severity}</span>;
}

/** A source pointer: "scene 4 · line 52: “snippet”". */
export function Cite({ line, snippet, scene }: { line: number; snippet: string; scene?: string }) {
  return (
    <span className="font-mono text-xs text-zinc-500">
      {scene ? `scene ${scene} · ` : ""}line {line}: “{snippet}”
    </span>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded border border-zinc-200 px-3 py-2 dark:border-zinc-800">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-xs text-zinc-500">{hint}</div>}
    </div>
  );
}

export function Section({ title, children, note }: { title: string; children: ReactNode; note?: string }) {
  return (
    <section className="mb-8">
      <h3 className="mb-1 font-semibold">{title}</h3>
      {note && <p className="mb-2 text-xs text-zinc-500">{note}</p>}
      {children}
    </section>
  );
}
