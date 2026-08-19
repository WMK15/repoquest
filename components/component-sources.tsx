"use client";

import { BookOpen, FileCode2 } from "lucide-react";
import type { CampaignEvidence, CampaignNode } from "@/lib/campaign/types";

function detectorLabel(detectorId: string) {
  return detectorId
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function ComponentSources({
  sourceFiles,
  documentation,
  evidence = [],
}: Pick<CampaignNode, "sourceFiles" | "documentation"> & {
  evidence?: CampaignEvidence[];
}) {
  if (sourceFiles.length === 0 && documentation.length === 0 && evidence.length === 0) {
    return null;
  }

  return (
    <details className="mt-5 border-t border-line pt-3">
      <summary className="w-fit rounded-sm font-mono text-xs font-medium text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary">
        See sources
      </summary>
      <div className="mt-3 space-y-4" aria-label="Source evidence">
        {evidence.length > 0 ? (
          <section aria-labelledby="source-files-heading">
            <h4 id="source-files-heading" className="rq-kicker !text-[0.58rem]">
              Code evidence
            </h4>
            <ul className="mt-1.5 space-y-3">
              {evidence.map((item) => (
                <li key={item.id} className="rq-inset min-w-0 p-3 text-xs">
                  <p className="font-medium leading-relaxed text-foreground">{item.claim}</p>
                  <p className="mt-1.5 flex min-w-0 items-start gap-1.5 font-mono text-[0.65rem] text-muted">
                    <FileCode2 className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                    <span className="min-w-0 break-all">
                      {item.path}:{item.lines.start}
                      {item.lines.end !== item.lines.start ? `-${item.lines.end}` : ""}
                    </span>
                  </p>
                  {item.detectorId && (
                    <p className="mt-1 font-mono text-[0.58rem] uppercase tracking-wide text-primary">
                      Detector · {detectorLabel(item.detectorId)}
                    </p>
                  )}
                  {item.excerpt && (
                    <pre className="mt-2 max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded border border-line bg-surface-strong p-2 font-mono text-[0.65rem] leading-relaxed text-foreground/90">
                      <code>{item.excerpt}</code>
                    </pre>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ) : sourceFiles.length > 0 ? (
          <section aria-labelledby="source-files-heading">
            <h4 id="source-files-heading" className="rq-kicker !text-[0.58rem]">
              Source files
            </h4>
            <ul className="mt-1.5 space-y-1.5">
              {sourceFiles.map((file) => (
                <li key={file} className="flex min-w-0 items-start gap-1.5 font-mono text-xs text-foreground">
                  <FileCode2 className="mt-0.5 h-3 w-3 shrink-0 text-muted" aria-hidden />
                  <span className="min-w-0 break-all">{file}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {documentation.length > 0 && (
          <section aria-labelledby="documentation-evidence-heading">
            <h4 id="documentation-evidence-heading" className="rq-kicker !text-[0.58rem]">
              Documentation
            </h4>
            <ul className="mt-1.5 space-y-2.5">
              {documentation.map((doc, index) => (
                <li key={`${doc.path}-${doc.heading ?? index}`} className="text-xs">
                  <p className="flex min-w-0 items-start gap-1.5 font-mono text-muted">
                    <BookOpen className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                    <span className="min-w-0 break-all">
                      {doc.path}
                      {doc.heading ? ` · ${doc.heading}` : ""}
                    </span>
                  </p>
                  <p className="mt-0.5 leading-relaxed text-foreground/90">{doc.insight}</p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </details>
  );
}
