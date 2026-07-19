"use client";

import { Rocket } from "lucide-react";
import type { InvestigationResult } from "@/lib/campaign/types";

export function CodeEvidencePanel({
  investigation,
  deploying,
  onDeploy,
}: {
  investigation: InvestigationResult;
  deploying: boolean;
  onDeploy?: () => void;
}) {
  const { diff, rootCause } = investigation;
  return (
    <div className="min-w-0">
      <p className="rq-kicker !text-danger">Root cause</p>
      <p className="mt-1.5 break-words text-sm leading-relaxed">{rootCause}</p>

      <p className="mt-4 break-all font-mono text-[0.65rem] text-muted">
        {diff.file}:{diff.line}
      </p>
      <pre className="rq-code mt-1.5 whitespace-pre-wrap break-words rounded-md p-3 font-mono text-xs leading-relaxed">
        <code>
          <span className="block text-[#fda4af]">- {diff.before}</span>
          <span className="block text-[#86efac]">+ {diff.after}</span>
        </code>
      </pre>
      <p className="mt-2 text-xs text-muted">
        Smallest safe correction · verified against{" "}
        <span className="font-mono">docs/authentication.md</span>
      </p>

      {onDeploy && (
        <button
          onClick={onDeploy}
          disabled={deploying}
          className="rq-cta rq-glow-success mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-success px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
        >
          <Rocket className="h-4 w-4" aria-hidden />
          {deploying ? "Deploying…" : "Deploy fix"}
        </button>
      )}
    </div>
  );
}
