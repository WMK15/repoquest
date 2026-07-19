"use client";

import { ArrowRight, CheckCircle2, Circle, Lock, Sparkles } from "lucide-react";
import type { RepositoryCampaign } from "@/lib/campaign/types";

const XP_PER_REGION = 15;

/**
 * Left-hand panel for external-repository campaigns: the region checklist
 * is the progression system — explore in order, earn XP, light the map.
 */
export function ExplorationPanel({
  campaign,
  exploredIds,
  currentRegionId,
  onFocusRegion,
  onBeginContribution,
  contributionAvailable,
  beginningContribution,
}: {
  campaign: RepositoryCampaign;
  exploredIds: string[];
  currentRegionId: string | null;
  onFocusRegion: (nodeId: string) => void;
  onBeginContribution?: () => void;
  contributionAvailable?: boolean;
  beginningContribution?: boolean;
}) {
  const xp = exploredIds.length * XP_PER_REGION;
  const done = exploredIds.length === campaign.nodes.length;

  return (
    <section className="rq-panel flex h-full min-w-0 flex-col overflow-hidden" aria-label="Exploration">
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-5">
      <p className="rq-kicker">Mission · Reconnaissance</p>
      <h2 className="mt-2 break-words text-xl font-semibold tracking-tight">
        {campaign.repositoryName}
      </h2>
      <p className="mt-2 break-words text-sm leading-relaxed text-muted">
        {done
          ? "Territory fully mapped. Start a scoped contribution when you are ready."
          : "Explore each region in order. Open the highlighted region on the map and study its briefing."}
      </p>

      <div className="mt-4 flex items-center justify-between rq-inset rounded-md px-3 py-2">
        <span className="rq-kicker !text-[0.58rem]">Field XP</span>
        <span className="flex items-center gap-1.5 font-mono text-sm text-primary">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          {xp} XP
        </span>
      </div>

      <ol className="mt-4 space-y-1.5 pr-1">
        {campaign.nodes.map((node) => {
          const explored = exploredIds.includes(node.id);
          const current = node.id === currentRegionId;
          const locked = !explored && !current;
          return (
            <li key={node.id}>
              <button
                onClick={() => !locked && onFocusRegion(node.id)}
                disabled={locked}
                className={`flex min-w-0 w-full items-center gap-2.5 rq-hover-card rounded-md border px-3 py-2 text-left text-sm ${
                  current
                    ? "border-investigating/60 bg-investigating/10"
                    : explored
                      ? "border-line"
                      : "border-transparent opacity-50"
                } ${locked ? "cursor-not-allowed" : "hover:border-primary/50"}`}
              >
                {explored ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden />
                ) : current ? (
                  <Circle className="h-4 w-4 shrink-0 text-investigating" aria-hidden />
                ) : (
                  <Lock className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
                )}
                <span className={explored || current ? "min-w-0 break-words text-foreground" : "min-w-0 break-words text-muted"}>
                  {node.gameLabel}
                </span>
                {current && (
                  <span className="ml-auto font-mono text-[0.6rem] text-investigating">
                    EXPLORE
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>

      <p className="mt-3 border-t border-line pt-3 font-mono text-[0.62rem] text-muted">
        {exploredIds.length}/{campaign.nodes.length} regions ·{" "}
        {XP_PER_REGION} XP per region
      </p>
      </div>

      {done && onBeginContribution && !contributionAvailable && (
        <div className="sticky bottom-0 z-10 shrink-0 border-t border-line bg-surface-strong/90 px-5 py-4 backdrop-blur">
          <button
            onClick={onBeginContribution}
            disabled={beginningContribution}
            className="rq-cta rq-glow-primary flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
          >
            {beginningContribution ? "Starting contribution…" : "Begin contribution"}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}
    </section>
  );
}
