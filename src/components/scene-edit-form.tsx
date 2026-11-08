"use client";

import { useState } from "react";
import { editSceneText } from "@/app/actions";

export function SceneEditForm({ baseId, scenes }: { baseId: number; scenes: { number: string; heading: string; text: string }[] }) {
  const [number, setNumber] = useState(scenes[0]?.number ?? "");
  const [text, setText] = useState(scenes[0]?.text ?? "");
  const [pending, setPending] = useState(false);

  return (
    <form action={editSceneText} onSubmit={() => setPending(true)} className="space-y-2">
      <input type="hidden" name="baseId" value={baseId} />
      <label className="block text-sm">
        <span className="mb-1 block text-zinc-500">Scene</span>
        <select
          name="scene"
          value={number}
          onChange={(e) => {
            setNumber(e.target.value);
            setText(scenes.find((s) => s.number === e.target.value)?.text ?? "");
          }}
          className="w-full rounded border border-zinc-300 bg-transparent px-2 py-1.5 dark:border-zinc-700"
        >
          {scenes.map((s) => (
            <option key={s.number} value={s.number}>
              {s.number}. {s.heading}
            </option>
          ))}
        </select>
      </label>
      <textarea
        name="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={12}
        aria-label="Scene text"
        className="w-full rounded border border-zinc-300 bg-transparent px-2 py-1.5 font-mono text-[13px] leading-6 dark:border-zinc-700"
      />
      <button disabled={pending} className="rounded bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">
        {pending ? "Re-checking…" : "Save as new version and show impact"}
      </button>
    </form>
  );
}
