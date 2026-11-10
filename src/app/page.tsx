import { Suspense } from "react";
import { connection } from "next/server";
import { startSampleRun, startSampleStory } from "@/app/actions";
import { StartForm } from "@/components/journey/start-form";
import { Loading, SetupNeeded } from "@/components/nav";
import { WorkspaceShell } from "@/components/workspace/shell";
import { databaseProblem, getDb } from "@/lib/db/client";

/** Starting a project also takes the agent's first turn in the background, which can take minutes. */
export const maxDuration = 300;

type Search = Promise<Record<string, string | string[] | undefined>>;

export default function Home({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<Loading />}>
      <Workspace searchParams={searchParams} />
    </Suspense>
  );
}

async function Workspace({ searchParams }: { searchParams: Search }) {
  await connection();
  const problem = databaseProblem();
  if (problem) return <SetupNeeded problem={problem} />;
  const from = (await searchParams).from === "screenplay" ? "screenplay" : "story";
  const sample = (action: () => Promise<void>, label: string) => (
    <form action={action}>
      <button className="btn-ink-ghost min-h-11! text-sm! text-gold-bright!">{label}</button>
    </form>
  );
  return (
    <WorkspaceShell db={await getDb()}>
      <div className="px-6 pt-10 pb-24 sm:px-10">
        <div className="mx-auto max-w-[1180px]">
          <p className="eyebrow text-gold-deep">New project</p>
          <p className="mt-2 max-w-[720px] text-[17px] leading-relaxed text-fg-2">
            Give the agent a story or a screenplay. It works through every stage on its own (story, screenplay, breakdown, places, schedule, budget), using the same tested tools a
            production office would, and shows each step as it goes. Message it or stop it at any time.
          </p>
          <div className="mt-8">
            <StartForm
              key={from}
              initial={from}
              samples={{ story: sample(startSampleStory, "Open “The Night Ferry”"), screenplay: sample(startSampleRun, "Open “The Keeper’s Ledger”") }}
            />
          </div>
        </div>
      </div>
    </WorkspaceShell>
  );
}
