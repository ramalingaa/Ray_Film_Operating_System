import { Suspense } from "react";
import { desc, eq } from "drizzle-orm";
import { connection } from "next/server";
import { uploadEditedScript } from "@/app/actions";
import { EmptyState, Loading } from "@/components/nav";
import { SceneEditForm } from "@/components/scene-edit-form";
import { getDb } from "@/lib/db/client";
import { documents, scenes } from "@/lib/db/schema";
import { computeImpact, type ImpactReport, type Touch } from "@/lib/impact/impact";
import { latestScript } from "@/lib/ui/queries";

type Search = Promise<Record<string, string | string[] | undefined>>;

/** Server actions on this page re-read edited scenes with a model, which can take minutes. */
export const maxDuration = 300;

export default function ImpactPage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<Loading />}>
      <Impact searchParams={searchParams} />
    </Suspense>
  );
}

async function Impact({ searchParams }: { searchParams: Search }) {
  await connection();
  const db = await getDb();
  const latest = await latestScript(db);
  if (!latest) return <EmptyState />;

  const versions = await db.select().from(documents).where(eq(documents.name, latest.name)).orderBy(desc(documents.version));
  const sp = await searchParams;
  const from = Number(sp.from);
  const to = Number(sp.to);
  let report: ImpactReport | undefined;
  let error: string | undefined;
  if (from && to) {
    try {
      report = await computeImpact(db, from, to);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }
  const sceneRows = await db.select().from(scenes).where(eq(scenes.docId, latest.id)).orderBy(scenes.ordinal);

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <h1 className="mb-1 text-2xl font-semibold">Change impact</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Change the script and see what it ripples into: later scenes, costume and location sheet rows, and findings. Only the scenes you changed are
        re-read by the model. Every version is kept.
      </p>

      {error && <p className="mb-6 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{error}</p>}
      {report && <Report r={report} />}

      <div className="grid gap-8 md:grid-cols-2">
        <section>
          <h2 className="mb-2 font-semibold">Edit one scene</h2>
          <p className="mb-3 text-sm text-zinc-500">
            Starts from version {latest.version} of {latest.name}.
          </p>
          <SceneEditForm baseId={latest.id} scenes={sceneRows.map((s) => ({ number: s.number, heading: s.heading, text: s.text }))} />
        </section>

        <div className="space-y-8">
          <section>
            <h2 className="mb-2 font-semibold">Upload an edited script</h2>
            <form action={uploadEditedScript} className="space-y-2">
              <input type="hidden" name="baseId" value={latest.id} />
              <input type="file" name="script" accept=".fountain,.txt" required aria-label="Edited Fountain script" className="block w-full text-sm" />
              <button className="rounded bg-zinc-900 px-3 py-1.5 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900">Upload and show impact</button>
            </form>
          </section>

          <section>
            <h2 className="mb-2 font-semibold">Compare two versions</h2>
            <form className="flex flex-wrap items-end gap-2 text-sm">
              {(["from", "to"] as const).map((name, i) => (
                <label key={name}>
                  <span className="mb-1 block text-zinc-500">{name === "from" ? "From" : "To"}</span>
                  <select
                    name={name}
                    defaultValue={String((name === "from" ? report?.from.id : report?.to.id) ?? versions[Math.min(versions.length - 1, i === 0 ? 1 : 0)]?.id)}
                    className="rounded border border-zinc-300 bg-transparent px-2 py-1.5 dark:border-zinc-700"
                  >
                    {versions.map((v) => (
                      <option key={v.id} value={v.id}>
                        version {v.version}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <button className="rounded border border-zinc-300 px-3 py-1.5 dark:border-zinc-700">Compare</button>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}

const TOUCH_LABEL: Record<Touch["kind"], string> = {
  day_shift: "Scenes that move to a different story day",
  costume_row: "Costume sheet",
  location_row: "Location sheet",
  later_scene: "Later scenes with the same character or prop",
  same_location: "Other scenes at the same location",
};

function Report({ r }: { r: ImpactReport }) {
  const groups = (Object.keys(TOUCH_LABEL) as Touch["kind"][]).map((k) => [k, r.touches.filter((t) => t.kind === k)] as const).filter(([, ts]) => ts.length);
  return (
    <section className="mb-10 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
      <div className="mb-1 text-xs text-zinc-500 uppercase">
        {r.from.name}: version {r.from.version} → version {r.to.version}
      </div>
      <p className="mb-5 text-lg leading-snug">{r.summary}</p>

      {(r.findings.added.length > 0 || r.findings.resolved.length > 0) && (
        <div className="mb-5 grid gap-3 sm:grid-cols-2">
          <FindingBlock title="New findings" tone="text-red-700 dark:text-red-400" items={r.findings.added} />
          <FindingBlock title="Resolved findings" tone="text-emerald-700 dark:text-emerald-400" items={r.findings.resolved} />
        </div>
      )}

      {groups.length > 0 && (
        <div className="mb-5 space-y-3">
          {groups.map(([kind, ts]) => (
            <div key={kind}>
              <h3 className="mb-1 text-sm font-semibold">{TOUCH_LABEL[kind]}</h3>
              <ul className="space-y-1 text-sm">
                {ts.map((t, i) => (
                  <li key={i} className="flex flex-wrap gap-x-2">
                    <span>{t.label}</span>
                    <span className="font-mono text-xs text-zinc-500">
                      {t.source.docName} line {t.source.line}: {t.source.snippet}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {(r.facts.added.length > 0 || r.facts.removed.length > 0) && (
        <details className="text-sm">
          <summary className="cursor-pointer text-zinc-500">
            Facts that changed (+{r.facts.added.length} / −{r.facts.removed.length})
          </summary>
          <ul className="mt-2 space-y-0.5 font-mono text-xs">
            {r.facts.removed.map((f, i) => (
              <li key={`r${i}`} className="text-red-700 dark:text-red-400">
                − scene {f.sceneNumber} · {f.subject || f.kind} {f.predicate} “{f.value}”
              </li>
            ))}
            {r.facts.added.map((f, i) => (
              <li key={`a${i}`} className="text-emerald-700 dark:text-emerald-400">
                + scene {f.sceneNumber} · {f.subject || f.kind} {f.predicate} “{f.value}” (line {f.line})
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function FindingBlock({ title, tone, items }: { title: string; tone: string; items: ImpactReport["findings"]["added"] }) {
  return (
    <div>
      <h3 className={`mb-1 text-sm font-semibold ${tone}`}>
        {title} ({items.length})
      </h3>
      <ul className="space-y-1 text-sm">
        {items.map((f, i) => (
          <li key={i}>
            <span className="mr-1 text-xs text-zinc-500 uppercase">{f.severity}</span>
            {f.title}
          </li>
        ))}
        {items.length === 0 && <li className="text-zinc-500">None.</li>}
      </ul>
    </div>
  );
}
