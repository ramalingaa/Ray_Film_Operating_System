"use client";

import { useRef, useState } from "react";
import { FileText, Paperclip, Play, Send, Square, X } from "lucide-react";
import { resumeAgentAction, sendAgentMessage, stopAgentAction } from "@/app/actions";
import type { AgentStatus } from "@/lib/db/schema";

const ACCEPT = ".txt,.md,.markdown,.text,.fountain,.spmd,.fdx,.csv";

/**
 * The chat box: a message, files to attach (stories, screenplays, costume and
 * location sheets), and stop / resume. Enter sends, Shift+Enter adds a line.
 */
export function Composer({ runId, status, hasMaterial }: { runId: number; status: AgentStatus; hasMaterial: boolean }) {
  const form = useRef<HTMLFormElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const placeholder = !hasMaterial
    ? "Paste your story or logline, or attach a screenplay…"
    : status === "running"
      ? "Message the agent; it reads this before its next step…"
      : status === "waiting"
        ? "Reply to the agent…"
        : status === "done"
          ? "Ask for changes, e.g. “reopen the schedule and make it 12 days”…"
          : "Tell the agent what to do next…";
  const canSend = (text.trim().length > 0 || files.length > 0) && !sending;

  return (
    <div className="flex flex-col gap-2">
      <form
        ref={form}
        action={async (fd) => {
          setSending(true);
          setError(null);
          fd.delete("files");
          for (const f of files) fd.append("files", f);
          try {
            const r = await sendAgentMessage(fd);
            if (r.error) setError(r.error);
            else {
              setText("");
              setFiles([]);
              // Follow the conversation from the message just sent.
              requestAnimationFrame(() => document.getElementById("timeline-end")?.scrollIntoView({ block: "end" }));
            }
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          } finally {
            setSending(false);
          }
        }}
        className="flex flex-col gap-2 rounded-[22px] border border-line bg-card p-2 shadow-[0_12px_30px_-18px_rgba(14,16,34,0.35)] focus-within:border-gold"
      >
        <input type="hidden" name="id" value={runId} />
        {files.length > 0 && (
          <ul className="flex flex-wrap gap-1.5 px-1.5 pt-1.5" aria-label="Attached files">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-paper-2 py-1 pr-1 pl-2.5 text-[13px]">
                <FileText aria-hidden size={13} className="flex-none text-fg-2" />
                <span className="truncate">{f.name}</span>
                <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))} className="inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-full hover:bg-line">
                  <X aria-hidden size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-end gap-1.5">
          <input
            ref={picker}
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              const picked = Array.from(e.target.files ?? []);
              if (picked.length) setFiles([...files, ...picked]);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            aria-label="Attach files"
            title="Attach a story, screenplay (.fountain, .fdx, .txt) or costume and location sheets (.csv)"
            onClick={() => picker.current?.click()}
            className="inline-flex h-11 w-11 flex-none cursor-pointer items-center justify-center rounded-full text-fg-2 transition hover:bg-paper-2 hover:text-fg"
          >
            <Paperclip aria-hidden size={18} />
          </button>
          <label htmlFor="agent-message" className="sr-only">
            Message the agent
          </label>
          <textarea
            id="agent-message"
            name="message"
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                if (canSend) form.current?.requestSubmit();
              }
            }}
            placeholder={placeholder}
            className="max-h-60 min-h-11 flex-1 resize-none bg-transparent px-1 py-2.5 text-[15px] leading-normal outline-none [field-sizing:content]"
          />
          <button aria-label="Send" disabled={!canSend} className="inline-flex h-11 w-11 flex-none cursor-pointer items-center justify-center rounded-full bg-fg text-ivory transition disabled:cursor-default disabled:opacity-35">
            <Send aria-hidden size={17} />
          </button>
        </div>
      </form>
      {error && (
        <p role="alert" className="px-2 text-sm text-rose">
          {error}
        </p>
      )}
      <div className="flex items-center justify-between gap-3 px-2 text-xs text-muted">
        <span>{hasMaterial ? "The agent drafts and approves each chapter for you. Step in, revise or reopen anything at any time." : "Attach .fountain, .fdx, .txt or .md, plus costume and location sheets as .csv."}</span>
        {status === "running" ? (
          <form action={stopAgentAction}>
            <input type="hidden" name="id" value={runId} />
            <button className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-line px-3 py-1.5 font-semibold text-fg hover:border-rose hover:text-rose">
              <Square aria-hidden size={12} /> Stop
            </button>
          </form>
        ) : (status === "stopped" || status === "failed") && hasMaterial ? (
          <form action={resumeAgentAction}>
            <input type="hidden" name="id" value={runId} />
            <button className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-line px-3 py-1.5 font-semibold text-fg hover:border-gold">
              <Play aria-hidden size={12} /> Resume
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
