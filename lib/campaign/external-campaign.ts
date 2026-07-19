import path from "node:path";
import type { RepositoryCampaign } from "./types";
import type { MarkdownDocument } from "../repository/read-markdown";
import type { RepoScan } from "../repository/scan-files";

/** Marks a campaign as exploration-only (no fix mission available). */
export const EXPLORATION_MISSION_ID = "exploration";

function gridPosition(index: number): { x: number; y: number } {
  return { x: (index % 3) * 300 + 60, y: Math.floor(index / 3) * 190 + 40 };
}

const MAX_REGIONS = 9;

/**
 * Heuristic campaign for a cloned external repository: one region per
 * top-level source directory. Works with no AI at all; AI (when available)
 * replaces descriptions, edges, and doc insights with grounded ones.
 */
export function buildHeuristicExternalCampaign(
  repoName: string,
  scan: RepoScan,
  docs: MarkdownDocument[]
): RepositoryCampaign {
  const groups = new Map<string, string[]>();
  for (const file of scan.sourceFiles) {
    const parts = file.split("/");
    const key = parts.length === 1 ? "(root)" : parts.slice(0, 2).join("/");
    const group = groups.get(key) ?? [];
    if (group.length < 40) group.push(file);
    groups.set(key, group);
  }

  const regions = [...groups.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, MAX_REGIONS);

  const nodes = regions.map(([dir, files], i) => ({
    id: `region-${i}`,
    label: dir,
    gameLabel: dir === "(root)" ? "Root Module" : path.basename(dir),
    description: `${files.length}${files.length === 40 ? "+" : ""} source files under ${dir}.`,
    // Regions start fogged; the player reveals them one by one.
    status: "unknown" as const,
    sourceFiles: files.slice(0, 12),
    position: gridPosition(i),
    documentation: [],
  }));

  return {
    repositoryName: repoName,
    summary: `${repoName}: ${scan.sourceFiles.length} source files and ${scan.markdownFiles.length} Markdown documents scanned. Regions below group the largest source directories.`,
    nodes,
    edges: [],
    knowledgeArchive: docs.slice(0, 12).map((doc) => ({
      path: doc.path,
      title: doc.title,
      kind: doc.kind,
      summary: doc.headings.slice(0, 3).join(" · ") || doc.title,
      headings: doc.headings.slice(0, 8),
      relatedNodeIds: [],
    })),
    contradictions: [],
    mission: {
      id: EXPLORATION_MISSION_ID,
      title: "Reconnaissance",
      narrative: `You have mounted ${repoName}. Build a mental model of the territory before your first mission.`,
      objective:
        "Open each region and its documentation to understand how the system fits together.",
      suspectNodeIds: [],
      corruptedNodeId: "",
    },
  };
}
