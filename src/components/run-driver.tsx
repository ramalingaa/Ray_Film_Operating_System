"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { advanceRun } from "@/app/actions";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Keeps a run moving while its page is open: asks the server for one step at
 * a time and refreshes the page after each, so reports appear as stages
 * finish. Closing the page pauses the run; reopening it resumes. Safe to
 * mount twice: the server lets only one step hold a run, others get "busy".
 */
export function RunDriver({ runId, active, silent = false }: { runId: number; active: boolean; silent?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    (async () => {
      let failures = 0;
      while (!cancelled) {
        try {
          const o = await advanceRun(runId);
          if (cancelled) return;
          failures = 0;
          setError(null);
          router.refresh();
          // Stop whenever the production needs a person: review, a choice, a failure, or the greenlight.
          if (o.state !== "progress" && o.state !== "busy") return;
          // Another tab or request holds the run: wait before asking again.
          if (o.state === "busy") await sleep(4000);
        } catch (err) {
          if (cancelled) return;
          failures++;
          setError(err instanceof Error ? err.message : String(err));
          if (failures >= 5) return;
          await sleep(3000 * failures);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, runId, router]);

  if (!active) return null;
  if (silent) {
    return error ? (
      <p role="status" className="text-sm text-rose">
        Retrying after a connection error: {error}
      </p>
    ) : null;
  }
  return (
    <p className="text-sm text-ink-soft">
      <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-gold align-middle" />
      Working… keep this page open; each report appears as soon as it is ready.
      {error && <span className="ml-2 text-rose">(retrying after an error: {error})</span>}
    </p>
  );
}
