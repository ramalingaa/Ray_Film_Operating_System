import type { ReactNode } from "react";

const STATUS_TONE: Record<string, string> = {
  done: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  running: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  queued: "bg-paper-2 text-ink-soft",
  pending: "bg-paper-2 text-ink-soft",
  failed: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_TONE[status] ?? STATUS_TONE.pending}`}>{status}</span>;
}

export const SEVERITY_TONE = {
  high: "bg-rose/15 text-rose ring-1 ring-rose/30",
  medium: "bg-gold-soft text-[#7a5a14] ring-1 ring-gold/30 dark:text-gold-bright",
  low: "bg-paper-2 text-ink-soft ring-1 ring-line",
} as const;

export function SeverityBadge({ severity }: { severity: keyof typeof SEVERITY_TONE }) {
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold tracking-wider uppercase ${SEVERITY_TONE[severity]}`}>{severity}</span>;
}

/** A source pointer: "scene 4 · line 52: “snippet”". */
export function Cite({ line, snippet, scene }: { line: number; snippet: string; scene?: string }) {
  return (
    <span className="block font-mono text-xs text-muted">
      {scene ? `scene ${scene} · ` : ""}line {line}: “{snippet}”
    </span>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="card px-4 py-3">
      <div className="text-xs tracking-wider text-muted uppercase">{label}</div>
      <div className="font-display text-3xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function Section({ title, children, note }: { title: string; children: ReactNode; note?: string }) {
  return (
    <section className="mb-10">
      <h3 className="font-display mb-1 text-2xl font-semibold">{title}</h3>
      {note && <p className="mb-3 text-sm text-muted">{note}</p>}
      {children}
    </section>
  );
}
