"use client";

import { ArrowRight, ShieldAlert } from "lucide-react";
import type { RepositoryCampaign } from "@/lib/campaign/types";

export function CandidatePicker({
  campaign,
  busy,
  error,
  onSelect,
}: {
  campaign: RepositoryCampaign;
  busy: boolean;
  error: string | null;
  onSelect: (candidateId?: string) => void;
}) {
  const candidates = campaign.contributionCandidates ?? [];
  const fallbackNode = campaign.nodes
    .map((node, index) => ({
      node,
      index,
      score:
        (node.status === "unknown" ? 0 : 2) +
        (typeof node.confidence === "number"
          ? node.confidence
          : node.confidence === "high"
            ? 1
            : node.confidence === "medium"
              ? 0.5
              : 0),
    }))
    .filter(({ node }) => node.sourceFiles.some((path) => path.trim().length > 0))
    .sort((left, right) => right.score - left.score || left.index - right.index)[0]?.node;

  return (
    <section className="rq-panel flex h-full min-w-0 flex-col overflow-hidden" aria-label="Choose a contribution">
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <p className="rq-kicker">Choose your contribution</p>
        <h2 className="mt-2 text-lg font-semibold tracking-tight">Select a bounded mission</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Each option is grounded in validated repository evidence. You choose what RepoQuest changes.
        </p>

        {candidates.length > 0 ? (
          <div className="mt-4 space-y-3">
            {candidates.map((candidate) => (
              <article key={candidate.id} className="min-w-0 rounded-lg border border-line bg-surface-strong p-3">
                <div className="flex flex-wrap gap-1.5 font-mono text-[0.58rem] uppercase tracking-wider">
                  <span className="rounded border border-primary/30 bg-primary-soft px-1.5 py-0.5 text-primary">
                    {candidate.kind}
                  </span>
                  <span className="rounded border border-line px-1.5 py-0.5 text-muted">
                    {candidate.difficulty}
                  </span>
                </div>
                <h3 className="mt-2 break-words text-sm font-semibold">{candidate.title}</h3>
                <p className="mt-1 break-words text-xs leading-5 text-muted">{candidate.rationale}</p>
                <div className="mt-3 rounded border border-line/70 bg-surface px-2.5 py-2">
                  <p className="rq-kicker !text-[0.55rem]">Scope</p>
                  <p className="mt-1 break-all font-mono text-[0.65rem] leading-5 text-foreground">
                    {candidate.paths.join(" · ")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onSelect(candidate.id)}
                  disabled={busy}
                  className="rq-cta mt-3 flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
                >
                  {busy ? "Starting mission..." : "Choose this mission"}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </button>
              </article>
            ))}
          </div>
        ) : fallbackNode ? (
          <div className="mt-4 rounded-lg border border-investigating/40 bg-investigating/10 p-3">
            <p className="rq-kicker !text-investigating">Bounded fallback</p>
            <h3 className="mt-2 text-sm font-semibold">Investigate a small improvement in {fallbackNode.label}</h3>
            <p className="mt-1 text-xs leading-5 text-muted">
              No evidence-derived candidates were found. This fallback is explicitly limited to the mapped files below.
            </p>
            <p className="mt-2 break-all font-mono text-[0.65rem] leading-5 text-foreground">
              {fallbackNode.sourceFiles.filter((path) => path.trim()).slice(0, 4).join(" · ")}
            </p>
            <button
              type="button"
              onClick={() => onSelect()}
              disabled={busy}
              className="rq-cta mt-3 flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busy ? "Starting fallback..." : "Use bounded fallback"}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-danger/40 bg-danger/10 p-3" role="status">
            <p className="flex items-center gap-2 text-sm font-semibold text-danger">
              <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden />
              No safe contribution was found
            </p>
            <p className="mt-2 text-xs leading-5 text-muted">
              The map contains no validated candidate and no non-empty editable node scope. RepoQuest will not create an ungrounded contribution.
            </p>
          </div>
        )}

        {error && (
          <p className="mt-3 rounded-md border border-danger/40 bg-danger/10 p-3 text-xs leading-5 text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
