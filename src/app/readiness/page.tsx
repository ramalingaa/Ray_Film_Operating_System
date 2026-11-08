import { Suspense } from "react";
import { connection } from "next/server";
import { EmptyState, Loading } from "@/components/nav";
import { PrintButton } from "@/components/print-button";
import { getDb } from "@/lib/db/client";
import { latestScript, loadReadiness, type FindingView } from "@/lib/ui/queries";

export default function ReadinessPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Report />
    </Suspense>
  );
}

async function Report() {
  await connection();
  const db = await getDb();
  const doc = await latestScript(db);
  const r = doc && (await loadReadiness(db, doc.id));
  if (!r) return <EmptyState />;

  const totals = (["high", "medium", "low"] as const).map((s) => ({ s, ...r.bySeverity[s] }));
  const unresolved = r.open.length + r.followUp.length;
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8 print:max-w-none print:p-0">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Continuity readiness</h1>
          <p className="text-sm text-zinc-500">
            {r.doc.name}, version {r.doc.version} · {r.sceneCount} scenes · generated {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        <PrintButton />
      </div>

      <p className="mb-6 text-lg">
        {unresolved === 0
          ? "No unresolved continuity conflicts."
          : `${unresolved} unresolved continuity conflict${unresolved === 1 ? "" : "s"} (${r.open.length} not yet reviewed, ${r.followUp.length} flagged for follow-up).`}
      </p>

      <table className="mb-8 w-full text-sm">
        <thead className="text-left text-zinc-500">
          <tr>
            <th className="py-1 font-medium">Severity</th>
            <th className="py-1 text-right font-medium">Not reviewed</th>
            <th className="py-1 text-right font-medium">Follow-up</th>
            <th className="py-1 text-right font-medium">Dismissed as intentional</th>
          </tr>
        </thead>
        <tbody>
          {totals.map((t) => (
            <tr key={t.s} className="border-t border-zinc-200 dark:border-zinc-800">
              <td className="py-1.5 capitalize">{t.s}</td>
              <td className="py-1.5 text-right tabular-nums">{t.open}</td>
              <td className="py-1.5 text-right tabular-nums">{t.followUp}</td>
              <td className="py-1.5 text-right tabular-nums">{t.dismissed}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="mb-2 font-semibold">By check</h2>
      <table className="mb-8 w-full text-sm">
        <tbody>
          {r.byCheck.map((c) => (
            <tr key={c.checkId} className="border-t border-zinc-200 dark:border-zinc-800">
              <td className="py-1.5">{c.title}</td>
              <td className="py-1.5 text-right tabular-nums text-zinc-500">
                {c.open} open · {c.followUp} follow-up · {c.dismissed} dismissed
              </td>
            </tr>
          ))}
          {r.byCheck.length === 0 && (
            <tr>
              <td className="py-2 text-zinc-500">No checks raised anything.</td>
            </tr>
          )}
        </tbody>
      </table>

      <FindingList title="Flagged for follow-up" items={r.followUp} />
      <FindingList title="Not yet reviewed" items={r.open} />
    </div>
  );
}

function FindingList({ title, items }: { title: string; items: FindingView[] }) {
  if (!items.length) return null;
  return (
    <section className="mb-8">
      <h2 className="mb-2 font-semibold">{title}</h2>
      <ol className="space-y-2 text-sm">
        {items.map((f) => (
          <li key={f.id} className="break-inside-avoid border-l-2 border-zinc-300 pl-3 dark:border-zinc-700">
            <div className="font-medium">
              <span className="mr-2 text-xs text-zinc-500 uppercase">{f.severity}</span>
              {f.title}
            </div>
            <div className="text-zinc-600 dark:text-zinc-400">{f.explanation}</div>
          </li>
        ))}
      </ol>
    </section>
  );
}
