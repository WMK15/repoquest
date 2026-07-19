"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

const BOOT_LINES = [
  "Mounting repository…",
  "Reading README.md…",
  "Loading AGENTS.md…",
  "Identifying system boundaries…",
  "Tracing authentication flow…",
  "Running baseline test…",
  "Generating onboarding campaign…",
];

const LINE_INTERVAL_MS = 700;

/**
 * Cinematic scanning overlay. In default mode it plays the fixed PulseBoard
 * lines; when `liveLines` is provided (external repos) it renders the real
 * sub-agent activity as it streams in. `ready` reports whether the start
 * API has responded; the overlay completes when both are done.
 */
export function BootSequence({
  ready,
  error,
  onComplete,
  title = "Repository scan · PulseBoard",
  liveLines,
}: {
  ready: boolean;
  error: string | null;
  onComplete: () => void;
  title?: string;
  liveLines?: string[];
}) {
  const [visibleLines, setVisibleLines] = useState(1);
  const isLive = liveLines !== undefined;

  useEffect(() => {
    if (isLive || visibleLines >= BOOT_LINES.length) return;
    const t = setTimeout(() => setVisibleLines((n) => n + 1), LINE_INTERVAL_MS);
    return () => clearTimeout(t);
  }, [visibleLines, isLive]);

  const linesDone = isLive || visibleLines >= BOOT_LINES.length;

  useEffect(() => {
    if (linesDone && ready && !error) {
      const t = setTimeout(onComplete, 500);
      return () => clearTimeout(t);
    }
  }, [linesDone, ready, error, onComplete]);

  const lines = isLive ? liveLines.slice(-12) : BOOT_LINES.slice(0, visibleLines);

  return (
    <div className="rq-grid-bg fixed inset-0 z-50 flex items-center justify-center bg-background/95 p-4">
      <div className="rq-panel flex max-h-[calc(100dvh-2rem)] w-[30rem] max-w-full flex-col overflow-hidden p-6 sm:p-8">
        <p className="rq-kicker mb-6 shrink-0 break-words">{title}</p>
        <ol
          className="min-h-0 space-y-2.5 overflow-y-auto overflow-x-hidden pr-2 font-mono text-sm"
          aria-live="polite"
        >
          {lines.map((line, i) => {
            const isCurrent = i === lines.length - 1 && !(linesDone && ready);
            return (
              <li key={`${i}-${line}`} className="flex min-w-0 items-start gap-2.5">
                {isCurrent ? (
                  <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-investigating" aria-hidden />
                ) : (
                  <span className="shrink-0 text-success" aria-hidden>✓</span>
                )}
                <span
                  className={`min-w-0 whitespace-normal break-words [overflow-wrap:anywhere] ${
                    isCurrent ? "text-foreground" : "text-muted"
                  }`}
                >
                  {line}
                </span>
              </li>
            );
          })}
        </ol>
        {error && (
          <div className="mt-6 shrink-0" role="alert">
            <p className="break-words text-sm text-danger">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-3 rounded-md border border-line px-4 py-2 text-xs text-foreground transition hover:border-primary/60"
            >
              Retry scan
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
