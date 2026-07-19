"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { AlertTriangle, CheckCircle2, FileCode2 } from "lucide-react";
import type { CampaignNode, NodeStatus } from "@/lib/campaign/types";

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

function ArchitectureNodeInner({ data, selected }: NodeProps<MapNode>) {
  const { campaignNode, status, dimmed } = data;
  const entryFile = campaignNode.sourceFiles[0];
  return (
    <div
      className={`rq-hover-card w-52 cursor-pointer rounded-lg border bg-surface-strong px-4 py-3 text-left duration-500 hover:border-primary/60 ${
        STATUS_STYLES[status]
      } ${dimmed ? "opacity-45" : "opacity-100"} ${selected ? "ring-2 ring-primary/60" : ""}`}
    >
      <Handle type="target" position={Position.Top} className="!bg-slate-400 !border-0" />
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="rq-kicker !text-[0.58rem]">{campaignNode.label}</p>
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
      {entryFile && (
        <p className="mt-1.5 flex min-w-0 items-center gap-1.5 font-mono text-[0.6rem] text-muted" title={entryFile}>
          <FileCode2 className="h-3 w-3 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 truncate" style={{ direction: "rtl", textAlign: "left" }}>
            {entryFile}
          </span>
        </p>
      )}
      <p className="mt-1 font-mono text-[0.58rem] uppercase tracking-wider text-muted/80">
        {campaignNode.sourceFiles.length} source file
        {campaignNode.sourceFiles.length === 1 ? "" : "s"} · {campaignNode.documentation.length} doc link
        {campaignNode.documentation.length === 1 ? "" : "s"}
      </p>
      <Handle type="source" position={Position.Bottom} className="!bg-slate-400 !border-0" />
    </div>
  );
}

export const ArchitectureNode = memo(ArchitectureNodeInner);
