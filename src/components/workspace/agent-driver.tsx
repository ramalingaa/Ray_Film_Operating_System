"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { advanceAgent } from "@/app/actions";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Speeds the project's agent up while its workspace is open: asks the server
 * for one agent turn at a time (instead of waiting for the next background
 * worker tick), and refreshes the page every few seconds so each tool call
 * shows up as it happens. The background worker carries on when the page is
 * closed. Safe alongside it: one turn holds a project, others get "busy".
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

/**
 * Chat scrolling: open at the newest message, and keep following new ones
 * as the agent works, unless the person has scrolled up to read.
 */
export function StickToBottom({ count }: { count: number }) {
  const pinned = useRef(true);
  useEffect(() => {
    // Pinned while the end of the conversation is on screen (on phones the reports sit below it).
    const onScroll = () => {
      const end = document.getElementById("timeline-end");
      pinned.current = !end || end.getBoundingClientRect().top <= window.innerHeight + 160;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    if (!pinned.current) return;
    // After layout, so streamed-in content is measured.
    const id = requestAnimationFrame(() => document.getElementById("timeline-end")?.scrollIntoView({ block: "end" }));
    return () => cancelAnimationFrame(id);
  }, [count]);
  return <span id="timeline-end" aria-hidden className="block scroll-mb-40" />;
}
