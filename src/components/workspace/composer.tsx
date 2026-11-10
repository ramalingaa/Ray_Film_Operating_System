"use client";

import { useRef, useState } from "react";
import { Play, Send, Square } from "lucide-react";
import { resumeAgentAction, sendAgentMessage, stopAgentAction } from "@/app/actions";
import type { AgentStatus } from "@/lib/db/schema";

const PLACEHOLDER: Record<AgentStatus, string> = {
  idle: "Tell the agent what to do…",
  running: "Message the agent; it reads this before its next step…",
  waiting: "Answer the agent…",
  done: "Ask for changes, e.g. “reopen the schedule and make it 12 days”…",
  stopped: "Tell the agent what to do differently, or resume…",
  failed: "Tell the agent how to proceed…",
};

/** Message box plus stop / resume. Enter sends, Shift+Enter adds a line. */
export function Composer({ runId, status }: { runId: number; status: AgentStatus }) {
  const form = useRef<HTMLFormElement>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <form
        ref={form}
        action={async (fd) => {
          setSending(true);
          try {
            await sendAgentMessage(fd);
            setText("");
          } finally {
            setSending(false);
          }
        }}
        className="flex items-end gap-2 rounded-[22px] border border-line bg-card p-2 shadow-[0_12px_30px_-18px_rgba(14,16,34,0.35)] focus-within:border-gold"
      >
        <input type="hidden" name="id" value={runId} />
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
              if (text.trim() && !sending) form.current?.requestSubmit();
            }
          }}
          placeholder={PLACEHOLDER[status]}
          className="max-h-48 min-h-11 flex-1 resize-none bg-transparent px-3 py-2.5 text-[15px] leading-normal outline-none [field-sizing:content]"
        />
        <button aria-label="Send" disabled={!text.trim() || sending} className="inline-flex h-11 w-11 flex-none cursor-pointer items-center justify-center rounded-full bg-fg text-ivory transition disabled:cursor-default disabled:opacity-35">
          <Send aria-hidden size={17} />
        </button>
      </form>
      <div className="flex items-center justify-between gap-3 px-2 text-xs text-muted">
        <span>The agent drafts and approves each chapter for you. Step in, revise or reopen anything at any time.</span>
        {status === "running" ? (
          <form action={stopAgentAction}>
            <input type="hidden" name="id" value={runId} />
            <button className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-line px-3 py-1.5 font-semibold text-fg hover:border-rose hover:text-rose">
              <Square aria-hidden size={12} /> Stop
            </button>
          </form>
        ) : status === "stopped" || status === "failed" || status === "waiting" ? (
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
