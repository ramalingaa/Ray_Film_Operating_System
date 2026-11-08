import { Suspense } from "react";
import { startSampleRun, startSampleStory } from "@/app/actions";
import { StartForm } from "@/components/journey/start-form";
import { Loading } from "@/components/nav";

/** Starting a production also takes its first step in the background, which can take minutes. */
export const maxDuration = 300;

type Search = Promise<Record<string, string | string[] | undefined>>;

export default function NewProductionPage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<Loading />}>
      <NewProduction searchParams={searchParams} />
    </Suspense>
  );
}

async function NewProduction({ searchParams }: { searchParams: Search }) {
  const from = (await searchParams).from === "screenplay" ? "screenplay" : "story";
  const sample = (action: () => Promise<void>, label: string) => (
    <form action={action}>
      <button className="btn-ink-ghost min-h-11! text-sm! text-gold-bright!">{label}</button>
    </form>
  );
  return (
    <div className="px-6 pt-14 pb-24 sm:px-8">
      <div className="mx-auto max-w-[1240px]">
        <StartForm
          key={from}
          initial={from}
          samples={{ story: sample(startSampleStory, "Open “The Night Ferry”"), screenplay: sample(startSampleRun, "Open “The Keeper’s Ledger”") }}
        />
      </div>
    </div>
  );
}
