"use client";

import { useState } from "react";
import { CircleAlert } from "lucide-react";
import type { RepositoryCampaign } from "@/lib/campaign/types";

const SUSPECT_REASONS: Record<string, string> = {
  "login-interface":
    "It builds the Authorization header. A malformed header would be rejected downstream.",
  "token-service":
    "It signs and verifies every token. A signature mismatch would fail all requests.",
  "access-gate":
    "It extracts and checks the token on every protected request — the last stop before 401.",
};

const REBUTTALS: Record<string, string> = {
  "login-interface":
    "Evidence says otherwise: the test shows the header is exactly `Bearer <token>` — well-formed. The Entry Terminal is clean.",
  "token-service":
    "Evidence says otherwise: issueToken → verifyToken round-trips correctly in isolation (the first test passes). The Token Forge is clean.",
};

export function SuspectSelector({
  campaign,
  onCorrect,
}: {
  campaign: RepositoryCampaign;
  onCorrect: () => void;
}) {
  const [rebuttal, setRebuttal] = useState<string | null>(null);
  const suspects = campaign.mission.suspectNodeIds
    .map((id) => campaign.nodes.find((n) => n.id === id))
    .filter((n) => n !== undefined);

  function select(nodeId: string) {
    if (nodeId === campaign.mission.corruptedNodeId) {
      onCorrect();
    } else {
      setRebuttal(REBUTTALS[nodeId] ?? "The evidence rules this component out.");
    }
  }

  return (
    <div className="min-w-0">
      <p className="rq-kicker">Identify the fault</p>
      <p className="mt-1.5 break-words text-sm text-muted">
        Codex narrowed the failure to three regions. Which one is denying access?
      </p>
      <div className="mt-3 flex flex-col gap-2.5">
        {suspects.map((node) => (
          <button
            key={node.id}
            onClick={() => select(node.id)}
            className="rq-hover-card min-w-0 w-full rounded-lg border border-line bg-surface-strong p-3.5 text-left hover:border-primary/60 hover:bg-primary-soft"
          >
            <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
              <p className="break-words text-sm font-semibold">{node.gameLabel}</p>
              <p className="min-w-0 break-all font-mono text-[0.62rem] text-muted">
                {node.sourceFiles[0]}
              </p>
            </div>
            <p className="mt-1.5 break-words text-xs leading-relaxed text-muted">
              {SUSPECT_REASONS[node.id] ?? node.description}
            </p>
          </button>
        ))}
      </div>
      {rebuttal && (
        <p className="mt-3 flex min-w-0 items-start gap-2 break-words rounded-md border border-investigating/40 bg-investigating/10 p-2.5 text-xs text-foreground" role="alert">
          <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-investigating" aria-hidden />
          {rebuttal}
        </p>
      )}
    </div>
  );
}
