"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { advanceAgent } from "@/app/actions";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Keeps the project's agent working while its workspace is open: asks the
 * server for one agent turn at a time, and refreshes the page every few
 * seconds meanwhile so each tool call shows up as it happens. Closing the
 * page pauses the agent between turns; reopening it resumes. Safe to mount
 * twice: the server lets one turn hold a project, others get "busy".
 */
export function AgentDriver({ runId, active }: { runId: number; active: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const tick = setInterval(() => router.refresh(), 2500);
    (async () => {
      let failures = 0;
      while (!cancelled) {
        try {
          const o = await advanceAgent(runId);
          if (cancelled) return;
          failures = 0;
          setError(null);
          router.refresh();
          if (o.state !== "progress" && o.state !== "busy") return;
          if (o.state === "busy") await sleep(4000);
        } catch (err) {
          if (cancelled) return;
          failures++;
          setError(err instanceof Error ? err.message : String(err));
          if (failures >= 5) return;
          await sleep(3000 * failures);
        }
      }
    })().finally(() => clearInterval(tick));
    return () => {
      cancelled = true;
      clearInterval(tick);
    };
  }, [active, runId, router]);

  return error ? (
    <p role="status" className="px-1 text-sm text-rose">
      Retrying after a connection error: {error}
    </p>
  ) : null;
}

/** Open at the newest timeline item, and keep it in view as the agent works unless the user has scrolled up. */
export function StickToBottom({ count }: { count: number }) {
  const first = useRef(true);
  useEffect(() => {
    const nearBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 400;
    if (first.current || nearBottom) document.getElementById("timeline-end")?.scrollIntoView({ block: "end" });
    first.current = false;
  }, [count]);
  return <span id="timeline-end" aria-hidden />;
}
