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
export function RunDriver({ runId, active }: { runId: number; active: boolean }) {
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
          if (o.state === "done" || o.state === "failed") return;
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
  return (
    <p className="text-sm text-sky-700 dark:text-sky-300">
      Working… keep this page open; reports appear as each stage finishes.
      {error && <span className="ml-2 text-red-700 dark:text-red-400">(retrying after an error: {error})</span>}
    </p>
  );
}
