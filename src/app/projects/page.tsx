import { Suspense } from "react";
import { connection } from "next/server";
import { startSampleRun, startSampleStory } from "@/app/actions";
import { StarMark } from "@/components/journey/stage-look";
import { Loading, SetupNeeded } from "@/components/nav";
import { NewProjectForm } from "@/components/workspace/new-project";
import { WorkspaceShell } from "@/components/workspace/shell";
import { databaseProblem, getDb } from "@/lib/db/client";

/** Opening a sample also takes the agent's first turn in the background, which can take minutes. */
export const maxDuration = 300;

export default function ProjectsHome() {
  return (
    <Suspense fallback={<Loading />}>
      <Workspace />
    </Suspense>
  );
}

async function Workspace() {
  await connection();
  const problem = databaseProblem();
  if (problem) return <SetupNeeded problem={problem} />;
  const sample = (action: () => Promise<void>, label: string) => (
    <form action={action} className="inline">
      <button className="cursor-pointer font-semibold text-gold-deep underline underline-offset-4">{label}</button>
    </form>
  );
  return (
    <WorkspaceShell db={await getDb()}>
      <div className="flex flex-1 items-center justify-center px-6 py-16 sm:px-10">
        <div className="flex w-full max-w-[640px] flex-col items-center text-center">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-ink text-gold-bright">
            <StarMark size={24} />
          </span>
          <h1 className="font-display mt-6 text-[44px] leading-[1.05] font-semibold sm:text-[52px]">What are we making?</h1>
          <p className="mt-3 max-w-[520px] text-[17px] leading-relaxed text-fg-2">
            Name the project and start a conversation. Share your idea, a story or a screenplay in the chat, and the agent takes it from there with you.
          </p>
          <div className="mt-8 w-full">
            <NewProjectForm />
          </div>
          <div className="mt-6 text-sm text-fg-2">
            Or open a sample: {sample(startSampleStory, "The Night Ferry")} (a story) · {sample(startSampleRun, "The Keeper’s Ledger")} (a screenplay)
          </div>
        </div>
      </div>
    </WorkspaceShell>
  );
}
