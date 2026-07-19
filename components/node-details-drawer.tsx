"use client";

import { ArrowDownRight, ArrowUpRight, BookOpen, FileCode2, X } from "lucide-react";
import type { NodeStatus, RepositoryCampaign } from "@/lib/campaign/types";

const STATUS_LABELS: Record<NodeStatus, { label: string; className: string }> = {
  unknown: { label: "Unknown", className: "text-muted" },
  discovered: { label: "Discovered", className: "text-foreground" },
  scanning: { label: "Scanning", className: "text-investigating" },
  healthy: { label: "Healthy", className: "text-success" },
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
  const node = campaign.nodes.find((n) => n.id === nodeId);
  if (!node) return null;

  const status = STATUS_LABELS[statusOverride ?? node.status];
  const incoming = campaign.edges.filter((e) => e.target === node.id);
  const outgoing = campaign.edges.filter((e) => e.source === node.id);
  const labelFor = (id: string) =>
    campaign.nodes.find((n) => n.id === id)?.gameLabel ?? id;

  return (
    <aside
      className="rq-panel absolute right-3 top-3 z-20 flex max-h-[calc(100%-1.5rem)] w-80 max-w-[calc(100%-1.5rem)] flex-col overflow-hidden"
      aria-label={`${node.gameLabel} details`}
    >
      <div className="shrink-0 bg-surface-strong/80 px-5 pt-5 pb-3 backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="rq-kicker">{node.label}</p>
            <h3 className="mt-0.5 text-lg font-semibold">{node.gameLabel}</h3>
          </div>
          <button onClick={onClose} aria-label="Close details" className="rounded p-1 text-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 pb-4">
        <p className={`mt-1 font-mono text-[0.65rem] uppercase tracking-widest ${status.className}`}>
          ● {status.label}
        </p>
        <p className="mt-3 text-sm leading-relaxed text-muted">{node.description}</p>

        <div className="mt-4">
          <p className="rq-kicker !text-[0.58rem]">Source files</p>
          {node.sourceFiles.map((f) => (
            <p key={f} className="mt-1 flex min-w-0 items-start gap-1.5 font-mono text-xs text-foreground">
              <FileCode2 className="mt-0.5 h-3 w-3 shrink-0 text-muted" aria-hidden />
              <span className="min-w-0 break-all">{f}</span>
            </p>
          ))}
        </div>

        {node.documentation.length > 0 && (
          <div className="mt-4">
            <p className="rq-kicker !text-[0.58rem]">Evidence</p>
            {node.documentation.map((doc, i) => (
              <div key={i} className="mt-1.5 text-xs">
                <p className="flex min-w-0 items-start gap-1.5 font-mono text-muted">
                  <BookOpen className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                  <span className="min-w-0 break-all">
                    {doc.path}
                    {doc.heading ? ` · ${doc.heading}` : ""}
                  </span>
                </p>
                <p className="mt-0.5 text-foreground/90">{doc.insight}</p>
              </div>
            ))}
          </div>
        )}

        {(incoming.length > 0 || outgoing.length > 0) && (
          <div className="mt-4 space-y-1 text-xs text-muted">
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
          </div>
        )}
      </div>

      {onMarkUnderstood && (
        <div className="shrink-0 border-t border-line bg-surface-strong/85 p-4 backdrop-blur">
          <button
            onClick={onMarkUnderstood}
            className="rq-cta rq-glow-primary w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
          >
            Mark region understood · +15 XP
          </button>
        </div>
      )}
    </aside>
  );
}
