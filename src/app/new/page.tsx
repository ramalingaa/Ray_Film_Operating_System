import { Suspense } from "react";
import { redirect } from "next/navigation";

type Search = Promise<Record<string, string | string[] | undefined>>;

/** New projects start in the workspace; old links to /new land there. */
export default function NewProductionPage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense>
      <Redirect searchParams={searchParams} />
    </Suspense>
  );
}

async function Redirect({ searchParams }: { searchParams: Search }): Promise<never> {
  redirect((await searchParams).from === "screenplay" ? "/?from=screenplay" : "/");
}
