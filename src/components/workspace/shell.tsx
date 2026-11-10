import Link from "next/link";
import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { STAGE_LOOK } from "@/components/journey/stage-look";
import type { Db } from "@/lib/db/client";
import type { AgentStatus } from "@/lib/db/schema";
import { CHAPTERS } from "@/lib/stages/chapters";
import { AGENT_STATUS_TEXT, listProjects } from "@/lib/ui/agent";

export const STATUS_DOT: Record<AgentStatus, string> = {
  idle: "#8D8BA3",
  running: "#E2C46B",
  waiting: "#A9C2F5",
  done: "#7FC79A",
  stopped: "#C9C6DA",
  failed: "#F08A8A",
};

/** The workspace frame: projects on the left, the selected project (or the new-project form) beside it. */
export async function WorkspaceShell({ db, selected, children }: { db: Db; selected?: number; children: ReactNode }) {
  const projects = await listProjects(db);
  return (
    <div className="flex flex-1 flex-col lg:flex-row">
      <div className="bg-ink-2 text-on-ink lg:w-[272px] lg:flex-none print:hidden">
        <aside aria-label="Projects" className="flex flex-col gap-3 px-4 py-5 lg:sticky lg:top-0 lg:max-h-dvh lg:overflow-y-auto">
          <Link href="/" className="btn-gold min-h-11! justify-center text-sm!" aria-current={selected === undefined ? "page" : undefined}>
            <Plus aria-hidden size={16} /> New project
          </Link>
          <p className="eyebrow mt-3 px-2 text-on-ink-2">Projects</p>
          {projects.length === 0 && <p className="px-2 text-sm text-on-ink-2">None yet. Start one and an agent takes it from there.</p>}
          <ul className="flex gap-1.5 overflow-x-auto lg:flex-col lg:overflow-visible">
            {projects.map((p) => {
              const greenlit = p.approvedThrough >= CHAPTERS.length - 1;
              const current = CHAPTERS[Math.min(CHAPTERS.length - 1, Math.max(0, p.approvedThrough + 1))];
              const active = p.id === selected;
              return (
                <li key={p.id} className="flex-none lg:flex-auto">
                  <Link
                    href={`/projects/${p.id}`}
                    aria-current={active ? "page" : undefined}
                    className={`flex min-w-[200px] flex-col gap-1 rounded-xl px-3 py-2.5 no-underline transition lg:min-w-0 ${active ? "bg-white/12" : "hover:bg-white/6"}`}
                  >
                    <span className="truncate text-[15px] font-semibold text-on-ink">{p.title}</span>
                    <span className="flex items-center gap-2 text-xs text-on-ink-2">
                      <span aria-hidden className={`h-2 w-2 flex-none rounded-full ${p.agentStatus === "running" ? "pulse" : ""}`} style={{ background: STATUS_DOT[p.agentStatus] }} />
                      <span className="truncate">
                        {AGENT_STATUS_TEXT[p.agentStatus]} · {greenlit ? "Greenlit" : current.title}
                      </span>
                    </span>
                    <span aria-hidden className="mt-1 grid grid-cols-6 gap-0.5">
                      {CHAPTERS.map((c, i) => (
                        <span
                          key={c.id}
                          className="h-1 rounded-full"
                          style={{
                            background: i <= p.approvedThrough ? STAGE_LOOK[c.id].base : "rgba(255,255,255,0.12)",
                          }}
                        />
                      ))}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </aside>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
