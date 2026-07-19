"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Loader2, MessageCircle, SendHorizonal, X } from "lucide-react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Floating Codex chat: a circle button that opens a compact window for
 * grounded questions about the mapped repository.
 */
export function ChatWindow({ campaignId }: { campaignId: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, thinking, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function send() {
    const question = input.trim();
    if (!question || thinking) return;
    const next: ChatMessage[] = [...messages, { role: "user", content: question }];
    setMessages(next);
    setInput("");
    setThinking(true);
    fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId, messages: next.slice(-12) }),
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "Chat failed.");
        return data;
      })
      .then((data) =>
        setMessages((m) => [...m, { role: "assistant", content: data.reply }])
      )
      .catch((e) =>
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: `Something went wrong: ${e.message ?? "chat failed"}. Try again.`,
          },
        ])
      )
      .finally(() => setThinking(false));
  }

  return (
    <div className="fixed bottom-4 left-4 z-50">
      {open && (
        <div
          className="rq-panel mb-3 flex h-[26rem] w-80 flex-col overflow-hidden"
          role="dialog"
          aria-label="Ask Codex"
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <p className="rq-kicker !text-[0.6rem]">Ask Codex</p>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              className="rounded p-1 text-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div ref={scrollRef} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3.5">
            {messages.length === 0 && (
              <p className="text-xs leading-relaxed text-muted">
                Ask anything about this repository — where things live, how the
                pieces connect, what to read first. Answers are grounded in the
                mapped docs and architecture.
              </p>
            )}
            {messages.map((message, i) => (
              <div
                key={i}
                className={`max-w-[90%] rounded-lg px-3 py-2 text-xs leading-relaxed ${
                  message.role === "user"
                    ? "ml-auto whitespace-pre-wrap bg-primary text-white"
                    : "rq-inset text-foreground"
                }`}
              >
                {message.role === "assistant" ? (
                  <div className="max-w-none break-words [&_a]:break-words [&_a]:text-primary [&_code]:break-words [&_code]:rounded [&_code]:bg-foreground/8 [&_code]:px-1 [&_code]:font-mono [&_h1]:mt-2 [&_h1]:font-semibold [&_h2]:mt-2 [&_h2]:font-semibold [&_h3]:mt-2 [&_h3]:font-semibold [&_li]:ml-4 [&_li]:list-disc [&_ol_li]:list-decimal [&_p]:mt-1.5 [&_pre]:mt-2 [&_pre]:whitespace-pre-wrap [&_pre]:break-words [&_pre]:rounded [&_pre]:bg-[#132033] [&_pre]:p-2 [&_pre]:text-[#dbe7f4] [&_table]:mt-2 [&_table]:w-full [&_table]:table-fixed [&_table]:border-collapse [&_td]:break-words [&_td]:border [&_td]:border-line [&_td]:px-2 [&_td]:py-1 [&_th]:break-words [&_th]:border [&_th]:border-line [&_th]:bg-foreground/5 [&_th]:px-2 [&_th]:py-1 [&_ul]:mt-1.5">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                  </div>
                ) : (
                  message.content
                )}
              </div>
            ))}
            {thinking && (
              <div className="rq-inset flex w-fit items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted">
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                Codex is reading…
              </div>
            )}
          </div>

          <form
            className="flex items-center gap-2 border-t border-line p-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <label htmlFor="chat-input" className="sr-only">
              Ask a question about the repository
            </label>
            <input
              id="chat-input"
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Where does auth happen?"
              className="min-w-0 flex-1 rounded-md border border-line bg-surface-strong px-3 py-2 text-xs text-foreground placeholder:text-muted focus:border-primary/60 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!input.trim() || thinking}
              aria-label="Send"
              className="rq-cta rq-glow-primary rounded-md bg-primary p-2 text-white transition hover:brightness-110 disabled:opacity-50"
            >
              <SendHorizonal className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close Codex chat" : "Open Codex chat"}
        className="rq-hover-card flex h-12 w-12 items-center justify-center rq-cta rq-glow-primary rounded-full bg-primary text-white shadow-lg hover:brightness-110"
      >
        <MessageCircle className="h-5 w-5" />
      </button>
    </div>
  );
}
