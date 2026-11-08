import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { EmptyState, Loading, SetupNeeded } from "@/components/nav";
import { ScriptReview } from "@/components/script-review";
import { databaseProblem, getDb } from "@/lib/db/client";
import { latestScript, loadReview } from "@/lib/ui/queries";

export default function Home() {
  return (
    <Suspense fallback={<Loading />}>
      <Review />
    </Suspense>
  );
}

async function Review() {
  await connection();
  const problem = databaseProblem();
  if (problem) return <SetupNeeded problem={problem} />;
  const db = await getDb();
  const doc = await latestScript(db);
  const data = doc && (await loadReview(db, doc.id));
  if (!data) return <EmptyState />;

  const open = data.findings.filter((f) => f.status === "open").length;
  return (
    <div className="flex h-[calc(100dvh-68px)] min-h-0 flex-col">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-zinc-200 px-4 py-2 text-sm dark:border-zinc-800">
        <span className="font-medium">
          {data.doc.name} <span className="text-zinc-500">version {data.doc.version}</span>
        </span>
        <span className="text-zinc-500">
          {data.scenes.length} scenes · {open} conflicts to review · click a conflict to see where it comes from
        </span>
        {data.openIssues > 0 && (
          <Link href="/issues" className="ml-auto text-amber-700 underline dark:text-amber-400">
            {data.openIssues} pipeline warnings
          </Link>
        )}
      </div>
      <ScriptReview scenes={data.scenes} findings={data.findings} />
    </div>
  );
}
