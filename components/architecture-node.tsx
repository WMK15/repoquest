"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { CampaignNode, NodeConfidence, NodeStatus } from "@/lib/campaign/types";

export type MapNodeData = {
  campaignNode: CampaignNode;
  status: NodeStatus;
  dimmed: boolean;
};
export type MapNode = Node<MapNodeData, "component">;

const STATUS_STYLES: Record<NodeStatus, string> = {
  unknown: "opacity-40 border-dashed border-foreground/30",
  discovered: "border-line",
  scanning: "rq-node-scanning border-investigating",
  healthy: "border-line",
  corrupted: "rq-node-corrupted border-danger/70",
  restored: "rq-node-restored border-success/80",
};

const STATUS_LABELS: Record<NodeStatus, string> = {
  unknown: "Unexplored",
  discovered: "Discovered",
  scanning: "Exploring",
  healthy: "Explored",
  corrupted: "Needs attention",
  restored: "Restored",
};

const TECHNOLOGY_BY_EXTENSION: Record<string, string> = {
  ts: "TypeScript",
  tsx: "React",
  js: "JavaScript",
  jsx: "React",
  py: "Python",
  rb: "Ruby",
  rs: "Rust",
  go: "Go",
  java: "Java",
  kt: "Kotlin",
  swift: "Swift",
  css: "CSS",
};

export function technologiesFor(node: CampaignNode): string[] {
  if (node.technologies?.length) return node.technologies;
  return [
    ...new Set(
      node.sourceFiles
        .map(
          (file) =>
            TECHNOLOGY_BY_EXTENSION[file.split(".").pop()?.toLowerCase() ?? ""]
        )
        .filter(Boolean)
    ),
  ];
}

function confidenceLabel(confidence?: NodeConfidence): string {
  if (confidence === undefined) return "Confidence not rated";
  if (typeof confidence === "string") return `${confidence} confidence`;
  return `${Math.round(confidence * 100)}% confidence`;
}

function ArchitectureNodeInner({ data, selected }: NodeProps<MapNode>) {
  const { campaignNode, status, dimmed } = data;
  const technologies = technologiesFor(campaignNode);
  return (
    <div
      className={`rq-hover-card w-52 cursor-pointer rounded-lg border bg-surface-strong px-4 py-3 text-left duration-500 hover:border-primary/60 ${
        STATUS_STYLES[status]
      } ${dimmed ? "opacity-45" : "opacity-100"} ${selected ? "ring-2 ring-primary/60" : ""}`}
    >
      <Handle type="target" position={Position.Top} className="!bg-slate-400 !border-0" />
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="rq-kicker !text-[0.58rem]">{campaignNode.category ?? campaignNode.label}</p>
          <p className="mt-0.5 text-sm font-semibold text-foreground">
            {campaignNode.gameLabel}
          </p>
        </div>
        {status === "corrupted" && (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-label="Corrupted" />
        )}
        {status === "restored" && (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-label="Restored" />
        )}
      </div>
      {technologies.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1" aria-label={`Technologies: ${technologies.join(", ")}`}>
          {technologies.slice(0, 3).map((technology) => (
            <span key={technology} className="rounded-full bg-primary-soft px-2 py-0.5 font-mono text-[0.58rem] text-primary">
              {technology}
            </span>
          ))}
        </div>
      )}
      <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted">
        {campaignNode.purpose ?? campaignNode.description}
      </p>
      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-line pt-2 font-mono text-[0.55rem] uppercase tracking-wider text-muted">
        <span>{confidenceLabel(campaignNode.confidence)}</span>
        <span>{STATUS_LABELS[status]}</span>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-slate-400 !border-0" />
    </div>
  );
}

export const ArchitectureNode = memo(ArchitectureNodeInner);
