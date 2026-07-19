"use client";

import { CheckCircle2, RotateCcw } from "lucide-react";
import type { FixResult } from "@/lib/campaign/types";

const LEARNINGS = [
  "Where authentication begins",
  "How tokens move through PulseBoard",
  "Where protected requests are authorised",
  "How the authentication flow is tested",
  "Which repository documents define engineering conventions",
];

export function CompletionScreen({
  fixResult,
  durationSeconds,
  resetting,
  onReset,
}: {
  fixResult: FixResult & { testSummary?: string };
  durationSeconds: number;
  resetting: boolean;
  onReset: () => void;
}) {
  const minutes = Math.floor(durationSeconds / 60);
  const seconds = durationSeconds % 60;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-6 backdrop-blur-sm">
      <div className="rq-panel max-h-[88vh] w-[44rem] max-w-full overflow-y-auto p-8">
        <p className="rq-kicker !text-success">Onboarding complete</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">
          Access Gate restored
        </h2>
        <p className="mt-2 text-sm text-muted">
          You now understand the PulseBoard authentication flow — and you have
          a verified first contribution.
        </p>

        <ul className="mt-5 space-y-1.5">
          {LEARNINGS.map((item) => (
            <li key={item} className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden />
              {item}
            </li>
          ))}
        </ul>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rq-inset rounded-md p-4">
            <p className="rq-kicker !text-[0.58rem]">Real contribution</p>
            <p className="mt-1.5 text-sm">
              Fixed bearer-token extraction in{" "}
              <span className="font-mono text-xs text-primary">
                src/middleware/require-auth.ts
              </span>
            </p>
            <pre className="mt-2 overflow-x-auto font-mono text-[0.65rem] leading-relaxed text-muted">
              {fixResult.diff.trim() || "diff unavailable"}
            </pre>
          </div>
          <div className="rq-inset rounded-md p-4">
            <p className="rq-kicker !text-[0.58rem]">Verification</p>
            <p className="mt-1.5 font-mono text-xs text-foreground">
              {fixResult.testCommand}
            </p>
            <p className="mt-1 font-mono text-xs text-success">
              {fixResult.testSummary ?? "Tests passed"}
            </p>
            <dl className="mt-3 space-y-1 font-mono text-[0.65rem] text-muted">
              <div className="flex justify-between">
                <dt>Files explored</dt>
                <dd className="text-foreground">6</dd>
              </div>
              <div className="flex justify-between">
                <dt>Documentation read</dt>
                <dd className="text-foreground">5</dd>
              </div>
              <div className="flex justify-between">
                <dt>System understanding</dt>
                <dd className="text-primary">100%</dd>
              </div>
              <div className="flex justify-between">
                <dt>Mission duration</dt>
                <dd className="text-foreground">
                  {minutes}m {seconds}s
                </dd>
              </div>
            </dl>
          </div>
        </div>

        <button
          onClick={onReset}
          disabled={resetting}
          className="mt-6 flex items-center gap-2 rounded-md border border-line px-5 py-2.5 text-sm font-medium transition hover:border-primary/60 disabled:opacity-60"
        >
          <RotateCcw className={`h-4 w-4 ${resetting ? "animate-spin" : ""}`} aria-hidden />
          {resetting ? "Restoring broken repository…" : "Reset campaign"}
        </button>
      </div>
    </div>
  );
}
