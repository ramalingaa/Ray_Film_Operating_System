import Link from "next/link";
import { Check, Lock, LoaderCircle } from "lucide-react";
import type { ChapterView, RunView } from "@/lib/ui/runs";
import { STAGE_LOOK, StarMark } from "./stage-look";

const NOTE: Record<ChapterView["state"], string> = {
  approved: "Locked · approved",
  skipped: "Skipped · began from a screenplay",
  ready: "Ready for your review",
  working: "Working…",
  awaiting_input: "Your move",
  failed: "Needs attention",
  locked: "",
};

/** The connected list of stages down the side of a production. */
export function StageRail({ run, selected }: { run: RunView; selected: number }) {
  return (
    <nav aria-label="Production stages" className="min-w-0 flex-[1_1_250px] rounded-[22px] border border-line bg-card px-5 py-5.5 lg:max-w-[290px]">
      <p className="eyebrow mb-4 text-muted">The journey</p>
      <ol>
        {run.chapters.map((c, i) => {
          const look = STAGE_LOOK[c.id];
          const done = c.state === "approved" || c.state === "skipped";
          const active = !done && c.state !== "locked";
          const isSel = c.index === selected;
          const dot =
            c.state === "skipped"
              ? { background: "#CFC6B1", color: "#fff" }
              : done
                ? { background: look.base, color: "#fff" }
                : c.state === "awaiting_input"
                  ? { background: "var(--card)", color: look.deep, border: `2px dashed ${look.base}` }
                  : c.state === "failed"
                    ? { background: "var(--rose-soft)", color: "var(--rose)" }
                    : c.state === "working"
                      ? { background: look.soft, color: look.deep }
                      : active
                        ? { background: look.base, color: "#fff", boxShadow: `0 0 0 5px ${look.base}33` }
                        : { background: "#F1ECE0", color: "#8B8EA3", border: "1px solid #E2DACA" };
          return (
            <li key={c.id} className="flex gap-3.5">
              <div className="flex flex-col items-center">
                <Link
                  href={`/runs/${run.id}?chapter=${c.index}`}
                  aria-current={isSel ? "step" : undefined}
                  aria-label={`Step ${i + 1}, ${c.title}: ${NOTE[c.state] || `opens after step ${i}`}`}
                  className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-full text-[15px] font-bold transition hover:scale-105"
                  style={dot}
                >
                  {done ? (
                    <Check aria-hidden size={18} strokeWidth={2.6} />
                  ) : c.state === "locked" ? (
                    <Lock aria-hidden size={15} strokeWidth={2} />
                  ) : c.state === "working" ? (
                    <LoaderCircle aria-hidden size={18} strokeWidth={2.4} className="spin" />
                  ) : c.state === "failed" ? (
                    "!"
                  ) : (
                    i + 1
                  )}
                </Link>
                {i < run.chapters.length - 1 && <span aria-hidden className="my-1 min-h-6.5 w-0.5 flex-1" style={{ background: c.state === "skipped" ? "#CFC6B1" : done ? look.base : "var(--line)" }} />}
              </div>
              <Link href={`/runs/${run.id}?chapter=${c.index}`} className={`flex flex-col gap-0.5 rounded-lg pt-2 pb-5.5 no-underline ${isSel ? "" : "opacity-95"}`}>
                <span className={`text-[15px] font-semibold ${c.state === "locked" ? "text-muted" : "text-fg"} ${isSel ? "underline decoration-2 underline-offset-4" : ""}`} style={isSel ? { textDecorationColor: look.base } : undefined}>
                  {c.title}
                </span>
                <span className="text-[13px]" style={{ color: active ? look.deep : done ? "var(--fg-2)" : "#8B8EA3", fontWeight: active ? 600 : 400 }}>
                  {NOTE[c.state] || `Opens after step ${i}`}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
      <div className={`mt-1 flex items-center gap-2.5 border-t border-line-2 pt-4 text-sm ${run.greenlit ? "font-semibold text-gold-deep" : "text-[#8B8EA3]"}`}>
        <StarMark size={18} className={run.greenlit ? "text-gold" : ""} />
        {run.greenlit ? "Greenlit for production" : "Greenlight after step 6"}
      </div>
    </nav>
  );
}
