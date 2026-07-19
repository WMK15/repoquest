"use client";

import { ArrowRight, BookOpen, Map as MapIcon, ScrollText } from "lucide-react";
import type { RepositoryCampaign } from "@/lib/campaign/types";

/**
 * Intro scene for an external repository: what RepoQuest found and what
 * the exploration campaign will cover.
 */
export function BriefingScreen({
  campaign,
  aiGenerated,
  onBegin,
}: {
  campaign: RepositoryCampaign;
  aiGenerated: boolean;
  onBegin: () => void;
}) {
  return (
    <div className="rq-grid-bg flex min-h-screen items-center justify-center p-6">
      <div className="rq-panel max-h-[90vh] w-[46rem] max-w-full overflow-y-auto p-8">
        <p className="rq-kicker">
          Mission briefing · {aiGenerated ? "Codex analysis" : "Structural scan"}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          {campaign.repositoryName}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">{campaign.summary}</p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rq-inset rounded-md p-4">
            <p className="rq-kicker !text-[0.58rem] flex items-center gap-1.5">
              <BookOpen className="h-3 w-3" aria-hidden />
              Knowledge Archive · {campaign.knowledgeArchive.length} documents
            </p>
            <ul className="mt-2 space-y-1.5">
              {campaign.knowledgeArchive.slice(0, 6).map((doc) => (
                <li key={doc.path} className="text-xs">
                  <span className="font-mono text-primary">{doc.path}</span>
                  <span className="ml-1.5 text-muted">— {doc.summary.slice(0, 70)}</span>
                </li>
              ))}
              {campaign.knowledgeArchive.length === 0 && (
                <li className="text-xs text-muted">
                  No Markdown documentation found — the map is built from source
                  structure alone.
                </li>
              )}
            </ul>
          </div>
          <div className="rq-inset rounded-md p-4">
            <p className="rq-kicker !text-[0.58rem] flex items-center gap-1.5">
              <MapIcon className="h-3 w-3" aria-hidden />
              Territory · {campaign.nodes.length} regions to explore
            </p>
            <ul className="mt-2 space-y-1.5">
              {campaign.nodes.slice(0, 6).map((node) => (
                <li key={node.id} className="text-xs text-muted">
                  <span className="text-foreground">{node.gameLabel}</span>
                  <span className="ml-1.5 font-mono text-[0.62rem]">{node.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {campaign.contradictions.length > 0 && (
          <div className="mt-4 rounded-md border border-investigating/40 bg-investigating/10 p-3">
            <p className="rq-kicker !text-[0.58rem] !text-investigating flex items-center gap-1.5">
              <ScrollText className="h-3 w-3" aria-hidden />
              Documentation may be out of date
            </p>
            <p className="mt-1 text-xs text-muted">
              {campaign.contradictions[0].documentedClaim}
            </p>
          </div>
        )}

        <div className="mt-7 flex items-center justify-between gap-4">
          <p className="text-xs text-muted">
            {campaign.mission.objective}
          </p>
          <button
            onClick={onBegin}
            className="flex shrink-0 items-center gap-2 rq-cta rq-glow-primary rounded-md bg-primary px-6 py-3 text-sm font-semibold text-white transition hover:brightness-110"
          >
            Begin exploration
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
