import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { startRun, startSampleRun } from "@/app/actions";
import { Loading, SetupNeeded } from "@/components/nav";
import { StatusBadge } from "@/components/run-bits";
import { databaseProblem, getDb } from "@/lib/db/client";
import { availableGateway } from "@/lib/llm/available";
import { STAGES } from "@/lib/stages";
import { listRuns } from "@/lib/ui/runs";

/** Starting a run also takes its first step in the background (see kickOff), which can take minutes. */
export const maxDuration = 300;

export default function Home() {
  return (
    <Suspense fallback={<Loading />}>
      <Analyze />
    </Suspense>
  );
}

async function Analyze() {
  await connection();
  const problem = databaseProblem();
  if (problem) return <SetupNeeded problem={problem} />;
  const recent = await listRuns(await getDb());
  const { gateway, reason } = availableGateway(["extract", "judge"]);

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <h1 className="mb-1 text-2xl font-semibold">Analyze a script or story</h1>
      <p className="mb-6 max-w-3xl text-sm text-zinc-500">
        Upload a file or paste text. A screenplay is read as is; a story, treatment or logline is first turned into a scene outline. Each stage then
        writes its own report, and every point links back to the line it came from.
      </p>

      <div className="grid gap-10 lg:grid-cols-[1fr_18rem]">
        <form action={startRun} className="space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block text-zinc-600 dark:text-zinc-400">Title (optional)</span>
            <input name="title" className="w-full rounded border border-zinc-300 bg-transparent px-2 py-1.5 dark:border-zinc-700" placeholder="Taken from the file if left empty" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-zinc-600 dark:text-zinc-400">Upload a file: Fountain (.fountain), Final Draft (.fdx), or plain text (.txt, .md)</span>
            <input type="file" name="file" accept=".fountain,.fdx,.txt,.md,.text" className="block w-full text-sm" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-zinc-600 dark:text-zinc-400">…or paste a screenplay, story, treatment or logline</span>
            <textarea
              name="text"
              rows={12}
              className="w-full rounded border border-zinc-300 bg-transparent px-2 py-1.5 font-mono text-xs dark:border-zinc-700"
              placeholder={"INT. HARBOR OFFICE - NIGHT\n\nVoss looks up from his desk...\n\n— or —\n\nA lighthouse keeper's daughter finds the ledger her father died protecting..."}
            />
          </label>
          <details className="text-sm">
            <summary className="cursor-pointer text-zinc-600 dark:text-zinc-400">Production sheets (optional)</summary>
            <div className="mt-3 space-y-3">
              <label className="block">
                <span className="mb-1 block text-zinc-500">Costume sheet (.csv)</span>
                <input type="file" name="costumes" accept=".csv" className="block w-full text-sm" />
              </label>
              <label className="block">
                <span className="mb-1 block text-zinc-500">Location sheet (.csv)</span>
                <input type="file" name="locations" accept=".csv" className="block w-full text-sm" />
              </label>
            </div>
          </details>
          <div className="flex flex-wrap items-center gap-3">
            <button className="rounded bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900">Analyze</button>
            <span className="text-xs text-zinc-500">
              {gateway ? <>Models: {gateway.specs("extract")[0]}{gateway.specs("extract").length > 1 ? ` (+${gateway.specs("extract").length - 1} fallback)` : ""}</> : <>No model configured ({reason}); only code-based checks will run.</>}
            </span>
          </div>
        </form>

        <aside className="space-y-6 text-sm">
          <section>
            <h2 className="mb-2 font-semibold">Stages</h2>
            <ol className="list-decimal space-y-1 pl-5 text-zinc-600 dark:text-zinc-400">
              {STAGES.map((s) => (
                <li key={s.id}>
                  <span className="text-zinc-900 dark:text-zinc-100">{s.title}</span>: {s.summary}
                </li>
              ))}
            </ol>
          </section>
          <section>
            <h2 className="mb-2 font-semibold">No script handy?</h2>
            <form action={startSampleRun}>
              <button className="rounded border border-zinc-300 px-3 py-1.5 dark:border-zinc-700">Run the sample screenplay</button>
            </form>
          </section>
        </aside>
      </div>

      {recent.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-2 font-semibold">Recent analyses</h2>
          <table className="w-full text-sm">
            <tbody>
              {recent.map((r) => (
                <tr key={r.id} className="border-t border-zinc-200 dark:border-zinc-800">
                  <td className="py-2 pr-3">
                    <Link href={`/runs/${r.id}`} className="font-medium hover:underline">
                      {r.title}
                    </Link>
                    <span className="ml-2 text-xs text-zinc-500">{r.inputKind}</span>
                  </td>
                  <td className="py-2 pr-3 text-zinc-500">{r.sourceName}</td>
                  <td className="py-2 pr-3 text-zinc-500 tabular-nums">
                    {r.stagesDone}/{r.stagesTotal} stages
                  </td>
                  <td className="py-2 text-right">
                    <StatusBadge status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
