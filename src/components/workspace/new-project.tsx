"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { startProject } from "@/app/actions";

/** The only form in the product: a project's name. Everything after it is a conversation with the agent. */
export function NewProjectForm() {
  const [busy, setBusy] = useState(false);
  return (
    <form action={startProject} onSubmit={() => setBusy(true)} className="flex w-full flex-col gap-3 sm:flex-row">
      <label htmlFor="project-title" className="sr-only">
        Project name
      </label>
      <input
        id="project-title"
        name="title"
        required
        maxLength={120}
        autoFocus
        autoComplete="off"
        placeholder="Name your project, e.g. The Night Ferry"
        className="field h-14 flex-1 rounded-full! px-6! text-[17px]"
      />
      <button className="btn-dark min-h-14! justify-center px-7! text-base!" disabled={busy}>
        {busy ? "Opening…" : "Start"} <ArrowRight aria-hidden size={18} />
      </button>
    </form>
  );
}
