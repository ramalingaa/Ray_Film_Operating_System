import { Check, CircleHelp, FileText, Flag, LoaderCircle, TriangleAlert, X } from "lucide-react";
import { StarMark } from "@/components/journey/stage-look";
import { TOOL_LABEL, type TimelineItem } from "@/lib/ui/agent";
import { TEST_LABEL } from "@/lib/ui/summaries";
import { CHAPTERS } from "@/lib/stages/chapters";

const MAX_DETAIL = 4000;

function detail(v: unknown): string {
  const s = JSON.stringify(v, null, 2) ?? "";
  return s.length > MAX_DETAIL ? `${s.slice(0, MAX_DETAIL)}\n… (${s.length.toLocaleString()} characters)` : s;
}

/** The label names what the call was about, e.g. "Read a report · Continuity". */
function toolTitle(item: Extract<TimelineItem, { type: "tool" }>): string {
  const base = TOOL_LABEL[item.tool] ?? item.tool;
  const i = item.input;
  if (typeof i.stage === "string") return `${base} · ${TEST_LABEL[i.stage] ?? i.stage}`;
  if (typeof i.chapter === "string") return `${base} · ${CHAPTERS.find((c) => c.id === i.chapter)?.title ?? i.chapter}`;
  if (typeof i.which === "string") return `${base} · the ${i.which}`;
  return base;
}

function ToolRow({ item }: { item: Extract<TimelineItem, { type: "tool" }> }) {
  if (item.tool === "ask_user" && item.state !== "error") {
    return (
      <div className="flex gap-3 rounded-2xl border border-gold/40 bg-gold-soft px-4 py-3.5">
        <CircleHelp aria-hidden size={18} className="mt-0.5 flex-none text-gold-deep" />
        <div>
          <p className="text-xs font-semibold tracking-wide text-gold-deep uppercase">The agent asks</p>
          <p className="mt-1 text-[15px] leading-relaxed">{String(item.input.question ?? item.summary)}</p>
        </div>
      </div>
    );
  }
  if (item.tool === "finish" && item.state === "ok") {
    return (
      <div className="flex gap-3 rounded-2xl border border-ok/30 bg-ok-soft px-4 py-3.5">
        <Flag aria-hidden size={18} className="mt-0.5 flex-none text-ok" />
        <div>
          <p className="text-xs font-semibold tracking-wide text-ok uppercase">Job done</p>
          <p className="mt-1 text-[15px] leading-relaxed whitespace-pre-wrap">{item.summary}</p>
        </div>
      </div>
    );
  }
  const icon =
    item.state === "running" ? (
      <LoaderCircle aria-label="Running" size={14} className="spin text-gold-deep" />
    ) : item.state === "ok" ? (
      <Check aria-label="Done" size={14} strokeWidth={2.6} className="text-ok" />
    ) : (
      <X aria-label="Failed" size={14} strokeWidth={2.6} className="text-rose" />
    );
  const hasDetail = Object.keys(item.input).length > 0 || item.output !== undefined;
  const head = (
    <>
      <span className="mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full bg-paper-2">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{toolTitle(item)}</span>
        {(item.summary || item.state === "running") && (
          <span className={`block text-[13px] leading-snug ${item.state === "error" ? "text-rose" : "text-fg-2"}`}>{item.state === "running" ? "Working…" : item.summary}</span>
        )}
      </span>
    </>
  );
  if (!hasDetail) return <div className="flex gap-2.5 px-1 py-1.5">{head}</div>;
  return (
    <details className="group rounded-xl px-1 py-1.5 open:bg-paper-2/60">
      <summary className="flex cursor-pointer list-none gap-2.5 [&::-webkit-details-marker]:hidden">{head}</summary>
      <div className="mt-2 ml-7.5 flex flex-col gap-2 text-xs">
        {Object.keys(item.input).length > 0 && (
          <div>
            <p className="font-semibold text-muted">Input</p>
            <pre className="mt-1 max-h-60 overflow-auto rounded-lg bg-card p-2.5 font-mono whitespace-pre-wrap text-fg-2">{detail(item.input)}</pre>
          </div>
        )}
        {item.output !== undefined && (
          <div>
            <p className="font-semibold text-muted">Result</p>
            <pre className="mt-1 max-h-72 overflow-auto rounded-lg bg-card p-2.5 font-mono whitespace-pre-wrap text-fg-2">{detail(item.output)}</pre>
          </div>
        )}
      </div>
    </details>
  );
}

/** The agent's work, oldest first: your messages, what it said, and each tool it called with the result. */
export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <ol className="flex flex-col gap-2.5" aria-label="Agent activity">
      {items.map((item, i) => {
        const key = `${item.type}-${item.id}-${i}`;
        switch (item.type) {
          case "user":
            return (
              <li key={key} className="ml-10 flex max-w-[calc(100%-2.5rem)] flex-col items-end gap-1.5 self-end">
                {item.files.length > 0 && (
                  <ul className="flex flex-wrap justify-end gap-1.5">
                    {item.files.map((f, j) => (
                      <li key={`${f.name}-${j}`} className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-card px-3 py-2 text-[13px]">
                        <FileText aria-hidden size={14} className="flex-none text-fg-2" />
                        <span className="font-semibold">{f.name}</span>
                        <span className="text-muted">{f.words.toLocaleString()} words</span>
                      </li>
                    ))}
                  </ul>
                )}
                {item.text && (
                  <p className={`rounded-[20px] rounded-br-md bg-fg px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap text-ivory ${item.text.length > 600 ? "max-h-72 overflow-y-auto" : ""}`}>{item.text}</p>
                )}
              </li>
            );
          case "agent":
            return (
              <li key={key} className="flex gap-3 pt-1">
                <span aria-hidden className="mt-0.5 inline-flex h-7 w-7 flex-none items-center justify-center rounded-full bg-ink text-gold-bright">
                  <StarMark size={14} />
                </span>
                <p className="min-w-0 flex-1 text-[15px] leading-relaxed whitespace-pre-wrap">{item.text}</p>
              </li>
            );
          case "tool":
            return (
              <li key={key} className="ml-10">
                <ToolRow item={item} />
              </li>
            );
          case "error":
            return (
              <li key={key} className="ml-10 flex gap-2.5 rounded-xl bg-rose-soft px-3.5 py-2.5 text-sm text-rose">
                <TriangleAlert aria-hidden size={16} className="mt-0.5 flex-none" />
                <span className="min-w-0 break-words">{item.text}</span>
              </li>
            );
          case "note":
            return (
              <li key={key} className="self-center rounded-full bg-paper-2 px-3 py-1 text-xs text-muted">
                {item.text}
              </li>
            );
        }
      })}
    </ol>
  );
}
