import { Suspense } from "react";
import { connection } from "next/server";
import { Loading } from "@/components/nav";
import { getDb } from "@/lib/db/client";
import { loadHealth } from "@/lib/ui/queries";

export default function IssuesPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Health />
    </Suspense>
  );
}

const TONE = {
  error: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  warning: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  info: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
} as const;

async function Health() {
  await connection();
  const { issues, agents } = loadHealth(getDb());
  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8">
      <h1 className="mb-1 text-2xl font-semibold">Pipeline health</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Every agent run and every problem the pipeline hit: skipped scenes, dropped facts, judges that did not answer.
      </p>

      <h2 className="mb-2 font-semibold">Agents</h2>
      <table className="mb-8 w-full text-sm">
        <thead className="text-left text-zinc-500">
          <tr>
            <th className="py-1 font-medium">Agent</th>
            <th className="py-1 text-right font-medium">OK</th>
            <th className="py-1 text-right font-medium">From cache</th>
            <th className="py-1 text-right font-medium">Failed</th>
            <th className="py-1 text-right font-medium">Tokens in / out</th>
          </tr>
        </thead>
        <tbody>
          {agents.map((a) => (
            <tr key={a.agent} className="border-t border-zinc-200 dark:border-zinc-800">
              <td className="py-1.5 font-mono text-xs">{a.agent}</td>
              <td className="py-1.5 text-right tabular-nums">{a.ok}</td>
              <td className="py-1.5 text-right tabular-nums">{a.cached}</td>
              <td className={`py-1.5 text-right tabular-nums ${a.failed ? "font-semibold text-red-700 dark:text-red-400" : ""}`}>{a.failed}</td>
              <td className="py-1.5 text-right tabular-nums">
                {a.inputTokens.toLocaleString()} / {a.outputTokens.toLocaleString()}
              </td>
            </tr>
          ))}
          {agents.length === 0 && (
            <tr>
              <td className="py-2 text-zinc-500">No model agents have run yet.</td>
            </tr>
          )}
        </tbody>
      </table>

      <h2 className="mb-2 font-semibold">Issues ({issues.length})</h2>
      <ul className="space-y-1.5 text-sm">
        {issues.map((i) => (
          <li key={i.id} className="flex gap-3 border-t border-zinc-200 py-1.5 dark:border-zinc-800">
            <span className={`h-fit rounded px-1.5 py-0.5 text-xs ${TONE[i.severity]}`}>{i.severity}</span>
            <span className="w-28 shrink-0 text-zinc-500">{i.stage}</span>
            <span className="min-w-0">
              <span className="text-zinc-500">{i.ref}: </span>
              {i.message}
            </span>
          </li>
        ))}
        {issues.length === 0 && <li className="text-zinc-500">No issues recorded.</li>}
      </ul>
    </div>
  );
}
