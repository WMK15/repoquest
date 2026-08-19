"use client";

import { useEffect, useEffectEvent, useRef } from "react";
import { ArrowDownRight, ArrowUpRight, CircleHelp, PencilLine, X } from "lucide-react";
import type { NodeStatus, RepositoryCampaign } from "@/lib/campaign/types";
import { technologiesFor } from "./architecture-node";
import { ComponentSources } from "./component-sources";

const STATUS_LABELS: Record<NodeStatus, { label: string; className: string }> = {
  unknown: { label: "Unknown", className: "text-muted" },
  discovered: { label: "Discovered", className: "text-foreground" },
  scanning: { label: "Scanning", className: "text-investigating" },
  healthy: { label: "Explored", className: "text-success" },
  corrupted: { label: "Corrupted", className: "text-danger" },
  restored: { label: "Restored", className: "text-success" },
};

export function NodeDetailsDrawer({
  campaign,
  nodeId,
  statusOverride,
  onClose,
  onMarkUnderstood,
}: {
  campaign: RepositoryCampaign;
  nodeId: string;
  statusOverride?: NodeStatus;
  onClose: () => void;
  /** Present during exploration when this is the current region. */
  onMarkUnderstood?: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const closeDrawer = useEffectEvent(onClose);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDrawer();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      previouslyFocused?.focus();
    };
  }, [nodeId]);

  const node = campaign.nodes.find((n) => n.id === nodeId);
  if (!node) return null;

  const status = STATUS_LABELS[statusOverride ?? node.status];
  const incoming = campaign.edges.filter((e) => e.target === node.id);
  const outgoing = campaign.edges.filter((e) => e.source === node.id);
  const technologies = technologiesFor(node);
  const entryPoints = node.entryPoints ?? [];
  const evidenceById = new Map((campaign.evidence ?? []).map((item) => [item.id, item]));
  const evidence = (node.evidenceIds ?? []).flatMap((id) => {
    const item = evidenceById.get(id);
    return item ? [item] : [];
  });
  const labelFor = (id: string) =>
    campaign.nodes.find((n) => n.id === id)?.gameLabel ?? id;

  return (
    <aside
      className="rq-panel absolute inset-x-2 bottom-2 z-20 flex max-h-[82%] flex-col overflow-hidden rounded-b-xl sm:inset-x-auto sm:bottom-auto sm:right-3 sm:top-3 sm:max-h-[calc(100%-1.5rem)] sm:w-80 sm:max-w-[calc(100%-1.5rem)]"
      role="dialog"
      aria-modal="false"
      aria-labelledby="node-details-title"
    >
      <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-line sm:hidden" aria-hidden />
      <div className="shrink-0 bg-surface-strong/80 px-5 pt-5 pb-3 backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="rq-kicker">{node.category ?? node.label}</p>
            <h3 id="node-details-title" className="mt-0.5 text-lg font-semibold">{node.gameLabel}</h3>
          </div>
          <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="Close details" className="-mr-2 -mt-2 flex h-10 w-10 items-center justify-center rounded-md text-muted hover:bg-primary-soft hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 pb-4">
        <p className={`mt-1 font-mono text-[0.65rem] uppercase tracking-widest ${status.className}`}>
          ● {status.label}
        </p>
        {node.purpose && (
          <p className="mt-3 text-sm leading-relaxed text-muted">{node.purpose}</p>
        )}

        <section className="mt-5" aria-labelledby="responsibilities-heading">
          <h4 id="responsibilities-heading" className="rq-kicker !text-[0.58rem]">Responsibilities</h4>
          {node.responsibilities?.length ? (
            <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-foreground/90">
              {node.responsibilities.map((responsibility) => <li key={responsibility}>• {responsibility}</li>)}
            </ul>
          ) : (
            <p className="mt-2 text-sm leading-relaxed text-foreground/90">{node.description}</p>
          )}
        </section>

        {technologies.length > 0 && (
          <section className="mt-5" aria-labelledby="technologies-heading">
            <h4 id="technologies-heading" className="rq-kicker !text-[0.58rem]">Technologies</h4>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {technologies.map((technology) => <span key={technology} className="rounded-full bg-primary-soft px-2 py-1 font-mono text-[0.65rem] text-primary">{technology}</span>)}
            </div>
          </section>
        )}

        {entryPoints.length > 0 && (
          <section className="mt-5" aria-labelledby="entry-points-heading">
            <h4 id="entry-points-heading" className="rq-kicker !text-[0.58rem]">Entry points</h4>
            <ul className="mt-2 space-y-1 font-mono text-xs text-foreground">
              {entryPoints.map((entryPoint) => <li key={entryPoint} className="break-all">{entryPoint}</li>)}
            </ul>
          </section>
        )}

        {(node.dependencies?.length || incoming.length > 0 || outgoing.length > 0) && (
          <section className="mt-5 space-y-1.5 text-xs text-muted" aria-labelledby="dependencies-heading">
            <h4 id="dependencies-heading" className="rq-kicker !text-[0.58rem]">Dependencies</h4>
            {node.dependencies?.map((dependency) => <p key={dependency}>{dependency}</p>)}
            {incoming.map((e) => (
              <p key={e.id} className="flex items-center gap-1.5">
                <ArrowDownRight className="h-3 w-3" aria-hidden />
                from {labelFor(e.source)} — {e.description}
              </p>
            ))}
            {outgoing.map((e) => (
              <p key={e.id} className="flex items-center gap-1.5">
                <ArrowUpRight className="h-3 w-3" aria-hidden />
                to {labelFor(e.target)} — {e.description}
              </p>
            ))}
          </section>
        )}

        {node.editGuidance && (
          <section className="rq-inset mt-5 p-3" aria-labelledby="edit-guidance-heading">
            <h4 id="edit-guidance-heading" className="rq-kicker flex items-center gap-1.5 !text-[0.58rem]"><PencilLine className="h-3 w-3" aria-hidden /> Edit guidance</h4>
            <p className="mt-2 text-sm leading-relaxed text-foreground/90">{node.editGuidance}</p>
          </section>
        )}

        {node.uncertainties?.length ? (
          <section className="mt-5" aria-labelledby="uncertainties-heading">
            <h4 id="uncertainties-heading" className="rq-kicker flex items-center gap-1.5 !text-[0.58rem]"><CircleHelp className="h-3 w-3" aria-hidden /> Uncertainties</h4>
            <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-muted">
              {node.uncertainties.map((uncertainty) => <li key={uncertainty}>• {uncertainty}</li>)}
            </ul>
          </section>
        ) : null}

        <ComponentSources
          sourceFiles={node.sourceFiles}
          documentation={node.documentation}
          evidence={evidence}
        />
      </div>

      {onMarkUnderstood && (
        <div className="shrink-0 border-t border-line bg-surface-strong/85 p-4 backdrop-blur">
          <button
            type="button"
            onClick={onMarkUnderstood}
            className="rq-cta rq-glow-primary w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
          >
            Mark region explored · +15 XP
          </button>
        </div>
      )}
    </aside>
  );
}
