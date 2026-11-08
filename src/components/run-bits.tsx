import type { ReactNode } from "react";

const STATUS_TONE: Record<string, string> = {
  done: "bg-ok-soft text-ok",
  running: "bg-[#E6EEFC] text-[#2A57B5]",
  queued: "bg-paper-2 text-fg-2",
  pending: "bg-paper-2 text-fg-2",
  failed: "bg-rose-soft text-rose",
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_TONE[status] ?? STATUS_TONE.pending}`}>{status}</span>;
}

export const SEVERITY_TONE = {
  high: "bg-rose-soft text-rose",
  medium: "bg-amber-soft text-amber",
  low: "bg-[#EFEBE1] text-fg-2",
} as const;

export const SEVERITY_BAND = { high: "#B83A3A", medium: "#D98A2B", low: "#A8A08C" } as const;

export function SeverityBadge({ severity }: { severity: keyof typeof SEVERITY_TONE }) {
  return <span className={`shrink-0 self-start rounded-full px-2.5 py-1 text-[11px] font-bold tracking-[0.1em] uppercase ${SEVERITY_TONE[severity]}`}>{severity}</span>;
}

/** A source pointer: "scene 4 · line 52 · “snippet”". */
export function Cite({ line, snippet, scene }: { line: number; snippet: string; scene?: string }) {
  return (
    <span className="block font-mono text-xs leading-normal text-muted">
      {scene ? `scene ${scene} · ` : ""}line {line} · “{snippet}”
    </span>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-[18px] bg-[#F5F1E7] p-4.5">
      <div className="text-xs font-semibold tracking-wider text-muted uppercase">{label}</div>
      <div className="font-display mt-1.5 text-[40px] leading-none font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-[13px] text-fg-2">{hint}</div>}
    </div>
  );
}

/** A report section: a paper card with a serif title. */
export function Section({ title, children, note }: { title: string; children: ReactNode; note?: string }) {
  return (
    <section className="card mb-6 p-7.5">
      <h3 className="font-display text-[32px] leading-tight font-semibold">{title}</h3>
      {note && <p className="mt-1 text-sm text-muted">{note}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}
