"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  Background,
  BackgroundVariant,
  ReactFlow,
  type Edge,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { NodeStatus, RepositoryCampaign } from "@/lib/campaign/types";
import { ArchitectureNode, type MapNode } from "./architecture-node";

const nodeTypes = { component: ArchitectureNode };

export interface MapOverrides {
  /** Per-node status overrides (e.g. scanning during investigation). */
  statuses?: Partial<Record<string, NodeStatus>>;
  /** When set, all nodes except these are dimmed. */
  focusNodeIds?: string[];
  /** Edge ids to render as active (cyan). */
  activeEdgeIds?: string[];
}

export function ArchitectureMap({
  campaign,
  overrides,
  onNodeSelect,
}: {
  campaign: RepositoryCampaign;
  overrides: MapOverrides;
  onNodeSelect: (nodeId: string | null) => void;
}) {
  const nodes = useMemo<MapNode[]>(
    () =>
      campaign.nodes.map((node) => ({
        id: node.id,
        type: "component" as const,
        position: node.position ?? { x: 0, y: 0 },
        data: {
          campaignNode: node,
          status: overrides.statuses?.[node.id] ?? node.status,
          dimmed: Boolean(
            overrides.focusNodeIds?.length &&
              !overrides.focusNodeIds.includes(node.id)
          ),
        },
        draggable: false,
        connectable: false,
      })),
    [campaign.nodes, overrides.statuses, overrides.focusNodeIds]
  );

  const instanceRef = useRef<ReactFlowInstance<MapNode, Edge> | null>(null);
  const zoomedRef = useRef(false);

  // Keep the map framed when the panel resizes or the campaign changes.
  useEffect(() => {
    const refit = () =>
      instanceRef.current?.fitView({ padding: 0.18, duration: 300 });
    const t = setTimeout(refit, 60);
    window.addEventListener("resize", refit);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", refit);
    };
  }, [campaign.repositoryName, campaign.nodes.length]);

  const edges = useMemo<Edge[]>(
    () =>
      campaign.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: undefined,
        className: overrides.activeEdgeIds?.includes(edge.id)
          ? "rq-edge-active"
          : undefined,
        animated: overrides.activeEdgeIds?.includes(edge.id) ?? false,
      })),
    [campaign.edges, overrides.activeEdgeIds]
  );

  const toggleZoom = useCallback(() => {
    const instance = instanceRef.current;
    if (!instance) return;
    if (zoomedRef.current) {
      instance.fitView({ padding: 0.18, duration: 250 });
      zoomedRef.current = false;
      return;
    }
    instance.zoomIn({ duration: 220 });
    zoomedRef.current = true;
  }, []);

  return (
    <div
      className="h-full w-full"
      data-testid="architecture-map"
      onDoubleClickCapture={(event) => {
        event.preventDefault();
        toggleZoom();
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onInit={(instance) => {
          instanceRef.current = instance;
        }}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        defaultEdgeOptions={{ type: "smoothstep" }}
        minZoom={0.4}
        maxZoom={1.4}
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_, node) => onNodeSelect(node.id)}
        onPaneClick={() => onNodeSelect(null)}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        zoomOnScroll={false}
        zoomOnDoubleClick={false}
        preventScrolling={false}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={26}
          size={1}
          color="rgba(255,255,255,0.08)"
        />
      </ReactFlow>
    </div>
  );
}
