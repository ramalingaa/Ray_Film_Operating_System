import { Suspense } from "react";
import { connection } from "next/server";
import { loadProject, loadSampleProject } from "@/app/actions";
import { Loading, SetupNeeded } from "@/components/nav";
import { databaseProblem } from "@/lib/db/client";
import { availableGateway } from "@/lib/llm/available";

/** Reading a full script with a model takes a few minutes. */
export const maxDuration = 300;

export default function LoadPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Load />
    </Suspense>
  );
}

async function Load() {
  await connection();
  const problem = databaseProblem();
  if (problem) return <SetupNeeded problem={problem} />;
  const { gateway, reason } = availableGateway(["extract", "judge"]);
  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-8">
      <h1 className="mb-1 text-2xl font-semibold">Load a script</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Upload a Fountain screenplay and, optionally, the costume and location sheets. The script is split into scenes, each scene is read by
        the model, and every continuity check runs. A 10-scene script takes a few minutes. Loading a script that is already stored reuses
        cached model answers.
      </p>

      <p className="mb-6 rounded border border-zinc-200 p-3 text-sm dark:border-zinc-800">
        {gateway ? (
          <>
            Models: <span className="font-mono text-xs">{gateway.specs("extract").join(", ")}</span>
          </>
        ) : (
          <>No model is configured ({reason}). Only the parser, the sheets and the deterministic checks will run.</>
        )}
      </p>

      <form action={loadProject} className="mb-10 space-y-4">
        <FileField name="script" label="Screenplay (.fountain)" accept=".fountain,.txt" required />
        <FileField name="costumes" label="Costume sheet (.csv, optional)" accept=".csv" />
        <FileField name="locations" label="Location sheet (.csv, optional)" accept=".csv" />
        <button className="rounded bg-zinc-900 px-3 py-1.5 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900">Load and check</button>
      </form>

      <section>
        <h2 className="mb-2 font-semibold">Or try the sample</h2>
        <p className="mb-3 text-sm text-zinc-500">“The Keeper’s Ledger”: 10 scenes with its costume and location sheets.</p>
        <form action={loadSampleProject}>
          <button className="rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700">Load the sample script</button>
        </form>
      </section>
    </div>
  );
}

function FileField({ name, label, accept, required }: { name: string; label: string; accept: string; required?: boolean }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-zinc-600 dark:text-zinc-400">{label}</span>
      <input type="file" name={name} accept={accept} required={required} className="block w-full text-sm" />
    </label>
  );
}
