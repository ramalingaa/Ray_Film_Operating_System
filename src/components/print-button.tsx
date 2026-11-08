"use client";

export function PrintButton() {
  return (
    <button onClick={() => window.print()} className="rounded border border-zinc-300 px-3 py-1.5 text-sm print:hidden dark:border-zinc-700">
      Print / save as PDF
    </button>
  );
}
