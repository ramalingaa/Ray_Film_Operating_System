import fs from "node:fs";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Loading } from "@/components/nav";
import type { EvalReport } from "@/lib/eval/run";

export default function EvalPage() {
  return (
    <Suspense fallback={<Loading />}>
      <EvalView />
    </Suspense>
  );
}

const pct = (x: number | null) => (x == null ? "n/a" : `${Math.round(x * 100)}%`);

function readLastRun(): EvalReport | undefined {
  try {
    return JSON.parse(fs.readFileSync("data/eval/last_run.json", "utf8")) as EvalReport;
  } catch {
    return undefined;
  }
}

async function EvalView() {
  await connection();
  if (process.env.NODE_ENV === "production") notFound();
  const r = readLastRun();
  if (!r) {
    return (
      <p className="p-10 text-center text-sm text-zinc-500">
        No eval run yet. Run <code>npm run eval</code>.
      </p>
    );
  }
  const s = r.seeded;
  const scored = s.tp - s.matches.filter((m) => !m.required).length + s.fn;
  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8">
      <h1 className="mb-1 text-2xl font-semibold">Eval</h1>
      <p className="mb-6 text-sm text-zinc-500">
        {new Date(r.ranAt).toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" })} · extraction: {r.models.join(", ") || "none"} · judge: {r.judge.models.join(", ") || "none"} ({r.judge.policy}, threshold{" "}
        {r.judge.threshold})
      </p>

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Precision", pct(s.precision), "target ≥ 80%"],
          ["Recall", pct(s.recall), "target ≥ 60%"],
          ["False alarms, clean script", String(r.clean.falseAlarms), "lower is better"],
          ["Planted errors scored", String(scored), `${s.outOfScope.length} not scored yet`],
        ].map(([label, value, hint]) => (
          <div key={label} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <div className="text-xs text-zinc-500">{label}</div>
            <div className="text-2xl font-semibold tabular-nums">{value}</div>
            <div className="text-xs text-zinc-500">{hint}</div>
          </div>
        ))}
      </div>

      <table className="mb-8 w-full text-sm">
        <thead className="text-left text-zinc-500">
          <tr>
            <th className="py-1 font-medium">Check</th>
            <th className="py-1 text-right font-medium">Precision</th>
            <th className="py-1 text-right font-medium">Recall</th>
            <th className="py-1 text-right font-medium">TP / FP / FN</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(s.perCheck).map(([id, c]) => (
            <tr key={id} className="border-t border-zinc-200 dark:border-zinc-800">
              <td className="py-1.5 font-mono text-xs">{id}</td>
              <td className="py-1.5 text-right tabular-nums">{pct(c.precision)}</td>
              <td className="py-1.5 text-right tabular-nums">{pct(c.recall)}</td>
              <td className="py-1.5 text-right tabular-nums">
                {c.tp} / {c.fp} / {c.fn}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <List title="Missed planted errors" items={s.missed.map((e) => `${e.id} · ${e.check_id} · scene ${e.scenes.join(", ")} — ${e.description}`)} />
      <List title="False alarms on the seeded script" items={s.falseAlarms.map((f) => `${f.checkId} · scene ${f.sceneNumbers.join(", ")} — ${f.title}`)} />
      <List title="False alarms on the clean script" items={r.clean.findings.map((f) => `${f.checkId} · scene ${f.sceneNumbers.join(", ")} — ${f.title}`)} />
    </div>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="mb-6">
      <h2 className="mb-1 font-semibold">
        {title} ({items.length})
      </h2>
      {items.length === 0 ? (
        <p className="text-sm text-zinc-500">None.</p>
      ) : (
        <ul className="list-disc space-y-0.5 pl-5 text-sm">
          {items.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
