"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { BookOpen, FileText, X } from "lucide-react";
import type { KnowledgeDoc } from "@/lib/campaign/types";

const KIND_LABELS: Record<KnowledgeDoc["kind"], string> = {
  overview: "Overview",
  architecture: "Architecture",
  contribution: "Conventions",
  "agent-instructions": "Agent notes",
  decision: "Decision",
  runbook: "Runbook",
  other: "Docs",
};

const KIND_BADGES: Record<KnowledgeDoc["kind"], string> = {
  overview: "bg-sky/10 text-sky",
  architecture: "bg-primary/10 text-primary",
  contribution: "bg-investigating/10 text-investigating",
  "agent-instructions": "bg-success/10 text-success",
  decision: "bg-brick/10 text-brick",
  runbook: "bg-sky/10 text-sky",
  other: "bg-foreground/5 text-muted",
};

export function DocumentationArchive({
  docs,
  campaignId,
}: {
  docs: KnowledgeDoc[];
  campaignId?: string | null;
}) {
  const [mobileExpanded, setMobileExpanded] = useState(true);
  const [openDoc, setOpenDoc] = useState<KnowledgeDoc | null>(null);
  const [loaded, setLoaded] = useState<{ path: string; content: string } | null>(null);

  useEffect(() => {
    if (!openDoc) return;
    let cancelled = false;
    fetch(
      `/api/docs?path=${encodeURIComponent(openDoc.path)}${campaignId ? `&campaignId=${encodeURIComponent(campaignId)}` : ""}`
    )
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (!cancelled) setLoaded({ path: openDoc.path, content: d.content });
      })
      .catch(() => {
        if (!cancelled)
          setLoaded({ path: openDoc.path, content: "_Could not load this document._" });
      });
    return () => {
      cancelled = true;
    };
  }, [openDoc, campaignId]);

  const content = openDoc && loaded?.path === openDoc.path ? loaded.content : null;
  const dialog =
    openDoc && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-label={openDoc.title}
            onClick={() => setOpenDoc(null)}
          >
            <div
              className="rq-panel flex max-h-[min(42rem,calc(100vh-3rem))] w-[min(58rem,calc(100vw-2rem))] flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sticky top-0 z-10 flex shrink-0 items-start justify-between gap-4 border-b border-line bg-surface-strong/90 px-5 py-4 backdrop-blur sm:px-6 sm:py-5">
                <div>
                  <p className="rq-kicker">{KIND_LABELS[openDoc.kind]} · discovered</p>
                  <h3 className="mt-1 font-mono text-sm text-primary">{openDoc.path}</h3>
                  <p className="mt-1.5 text-sm text-muted">{openDoc.summary}</p>
                </div>
                <button
                  onClick={() => setOpenDoc(null)}
                  aria-label="Close document"
                  className="rounded p-1 text-muted hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 py-4 sm:px-6">
                <details className="mb-4 rounded-lg border border-primary/20 bg-primary-soft p-4" open>
                  <summary className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-primary">
                    AI summary
                  </summary>
                  <p className="mt-3 text-sm leading-6 text-muted">{openDoc.summary}</p>
                  {openDoc.headings.length > 0 && (
                    <div className="mt-3">
                      <p className="font-mono text-[0.58rem] uppercase tracking-[0.18em] text-muted">
                        What to scan
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {openDoc.headings.slice(0, 6).map((heading) => (
                          <span
                            key={heading}
                            className="rounded border border-line bg-surface-strong px-2 py-1 text-xs text-foreground"
                          >
                            {heading}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </details>

                <div className="prose-sm max-w-none break-words text-sm leading-relaxed [&_a]:break-words [&_a]:text-primary [&_code]:break-words [&_code]:rounded [&_code]:bg-foreground/8 [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.75rem] [&_h1]:mt-4 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:font-semibold [&_li]:ml-4 [&_li]:list-disc [&_p]:mt-2 [&_p]:text-muted [&_pre]:mt-2 [&_pre]:whitespace-pre-wrap [&_pre]:break-words [&_pre]:rounded-md [&_pre]:bg-[#132033] [&_pre]:p-3 [&_pre]:text-[#dbe7f4] [&_table]:mt-3 [&_table]:w-full [&_table]:table-fixed [&_table]:border-collapse [&_td]:break-words [&_td]:border [&_td]:border-line [&_td]:px-3 [&_td]:py-2 [&_td]:align-top [&_th]:break-words [&_th]:border [&_th]:border-line [&_th]:bg-foreground/5 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:align-top">
                  {content === null ? (
                    <p className="text-muted">Loading…</p>
                  ) : (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
                  )}
                </div>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <section className="w-full min-w-0 max-w-full overflow-hidden rounded-xl border border-slate-200 bg-white px-3 py-3 text-foreground shadow-[0_14px_40px_-24px_rgba(15,42,60,0.55)] sm:px-4" aria-label="Knowledge Archive">
      <div className="flex min-w-0 items-center justify-between gap-3 md:mb-3">
        <p className="rq-kicker flex min-w-0 items-center gap-1.5 break-words">
          <BookOpen className="h-3 w-3" aria-hidden />
          Knowledge Archive
        </p>
        <button
          type="button"
          onClick={() => setMobileExpanded((expanded) => !expanded)}
          className="shrink-0 rounded border border-line px-2 py-1 font-mono text-[0.6rem] uppercase tracking-wider text-muted hover:border-primary/50 hover:text-primary md:hidden"
        >
          {mobileExpanded ? "Hide" : `${docs.length} files`}
        </button>
        <p className="hidden shrink-0 font-mono text-[0.65rem] text-muted md:block">
          {docs.length} markdown files
        </p>
      </div>

      <div className={`${mobileExpanded ? "mt-3 grid" : "hidden"} max-h-56 grid-cols-1 gap-2 overflow-y-auto overflow-x-hidden pr-1 md:mt-0 md:grid md:max-h-44 md:grid-cols-2 xl:grid-cols-3`}>
        {docs.map((doc) => (
          <button
            key={doc.path}
            onClick={() => setOpenDoc(doc)}
            className="rq-hover-card group min-w-0 rounded-md border border-slate-200 bg-white px-3 py-2 text-left shadow-sm hover:border-primary/60"
            title={doc.summary}
          >
            <div className="flex min-w-0 items-start gap-2">
              <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
              <div className="min-w-0 max-w-full overflow-hidden">
                <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
                  <span className="min-w-0 max-w-full break-all font-mono text-xs text-foreground">
                    {doc.path}
                  </span>
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[0.55rem] font-medium uppercase tracking-wider ${KIND_BADGES[doc.kind]}`}
                  >
                    {KIND_LABELS[doc.kind]}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 min-w-0 break-words text-xs leading-5 text-muted">
                  {doc.summary}
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>

      {dialog}
    </section>
  );
}
