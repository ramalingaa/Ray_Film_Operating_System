import { Section, Stat } from "@/components/run-bits";
import type { BudgetReport } from "@/lib/stages/budget";

export function BudgetReportView({ r }: { r: BudgetReport }) {
  const money = (n: number) => new Intl.NumberFormat("en", { style: "currency", currency: r.currency, maximumFractionDigits: 0 }).format(n);
  return (
    <div>
      <p className="mb-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
        A rough estimate from placeholder {r.tier}-film rates, to show what drives cost. It is not a quote. Replace the rates with your own (BUDGET_RATES).
      </p>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Rough total" value={money(r.total)} />
        {r.sections.slice(0, 3).map((s) => (
          <Stat key={s.section} label={s.section} value={money(s.amount)} hint={`${Math.round((s.amount / r.total) * 100)}%`} />
        ))}
      </div>

      <Section title="Biggest cost drivers">
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          {r.drivers.map((l, i) => (
            <li key={i}>
              <span className="font-medium">{l.label}</span>: {money(l.amount)} <span className="text-zinc-500">({l.basis})</span>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Top sheet">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-zinc-500">
            <tr>
              <th className="py-1 pr-2 font-medium">Line</th>
              <th className="py-1 pr-2 text-right font-medium">Qty</th>
              <th className="py-1 pr-2 text-right font-medium">Rate</th>
              <th className="py-1 pr-2 text-right font-medium">Amount</th>
              <th className="py-1 font-medium">Basis</th>
            </tr>
          </thead>
          <tbody>
            {r.sections.map((s) => (
              <SectionRows key={s.section} title={s.section} total={money(s.amount)} lines={r.lines.filter((l) => l.section === s.section)} money={money} />
            ))}
            <tr className="border-t-2 border-zinc-400 font-semibold">
              <td className="py-2">Total</td>
              <td />
              <td />
              <td className="py-2 pr-2 text-right tabular-nums">{money(r.total)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </Section>

      <Section title="Assumptions">
        <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
          {r.assumptions.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function SectionRows({ title, total, lines, money }: { title: string; total: string; lines: BudgetReport["lines"]; money: (n: number) => string }) {
  return (
    <>
      <tr className="border-t border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
        <td className="py-1.5 font-semibold" colSpan={3}>
          {title}
        </td>
        <td className="py-1.5 pr-2 text-right font-semibold tabular-nums">{total}</td>
        <td />
      </tr>
      {lines.map((l, i) => (
        <tr key={i} className="border-t border-zinc-100 align-top dark:border-zinc-900">
          <td className="py-1 pr-2 pl-3">{l.label}</td>
          <td className="py-1 pr-2 text-right whitespace-nowrap tabular-nums">
            {l.qty} {l.unit}
          </td>
          <td className="py-1 pr-2 text-right tabular-nums">{money(l.rate)}</td>
          <td className="py-1 pr-2 text-right tabular-nums">{money(l.amount)}</td>
          <td className="py-1 text-xs text-zinc-500">{l.basis}</td>
        </tr>
      ))}
    </>
  );
}
