import { z } from "zod";

export const NodeStatusSchema = z.enum([
  "unknown",
  "discovered",
  "scanning",
  "healthy",
  "corrupted",
  "restored",
]);
export type NodeStatus = z.infer<typeof NodeStatusSchema>;

export const CampaignNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  gameLabel: z.string(),
  description: z.string(),
  status: NodeStatusSchema,
  sourceFiles: z.array(z.string()),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
  documentation: z.array(
    z.object({
      path: z.string(),
      heading: z.string().optional(),
      insight: z.string(),
    })
  ),
});
export type CampaignNode = z.infer<typeof CampaignNodeSchema>;

export const CampaignEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  description: z.string(),
});
export type CampaignEdge = z.infer<typeof CampaignEdgeSchema>;

export const KnowledgeDocSchema = z.object({
  path: z.string(),
  title: z.string(),
  kind: z.enum([
    "overview",
    "architecture",
    "contribution",
    "agent-instructions",
    "decision",
    "runbook",
    "other",
  ]),
  summary: z.string(),
  headings: z.array(z.string()),
  relatedNodeIds: z.array(z.string()),
});
export type KnowledgeDoc = z.infer<typeof KnowledgeDocSchema>;

export const ContradictionSchema = z.object({
  documentedClaim: z.string(),
  codeEvidence: z.string(),
  documentationPath: z.string(),
  sourcePath: z.string(),
});
export type Contradiction = z.infer<typeof ContradictionSchema>;

export const MissionSchema = z.object({
  id: z.string(),
  title: z.string(),
  narrative: z.string(),
  objective: z.string(),
  suspectNodeIds: z.array(z.string()),
  corruptedNodeId: z.string(),
});
export type Mission = z.infer<typeof MissionSchema>;

export const RepositoryCampaignSchema = z.object({
  repositoryName: z.string(),
  summary: z.string(),
  nodes: z.array(CampaignNodeSchema),
  edges: z.array(CampaignEdgeSchema),
  knowledgeArchive: z.array(KnowledgeDocSchema),
  contradictions: z.array(ContradictionSchema),
  mission: MissionSchema,
});
export type RepositoryCampaign = z.infer<typeof RepositoryCampaignSchema>;

export type InvestigationEvent =
  | {
      type: "phase_started";
      phase: "scout" | "investigator" | "builder" | "reviewer";
      label: string;
    }
  | { type: "file_read"; path: string; nodeId: string; message: string }
  | {
      type: "documentation_read";
      path: string;
      nodeId?: string;
      message: string;
    }
  | { type: "test_run"; command: string; success: boolean; message: string }
  | { type: "finding"; nodeId: string; message: string }
  | { type: "investigation_complete"; rootCause: string; proposedFix: string };

export interface InvestigationResult {
  events: InvestigationEvent[];
  rootCause: string;
  proposedFix: string;
  diff: { before: string; after: string; file: string; line: number };
  testCommand: string;
  aiGenerated: boolean;
}

export type CampaignStage =
  | "landing"
  | "scanning"
  | "mapped"
  | "investigating"
  | "challenge"
  | "fix-ready"
  | "fixing"
  | "complete";

export interface CampaignSession {
  id: string;
  campaign: RepositoryCampaign;
  stage: CampaignStage;
  selectedSuspectNodeId?: string;
  investigation?: InvestigationResult;
  aiGenerated: boolean;
  startedAt: number;
  workspaceRoot?: string;
  contributionSessionId?: string;
  runtimeMode?: "live";
  repositoryId?: string;
}

export interface FixResult {
  success: boolean;
  changedFile: string;
  diff: string;
  testCommand: string;
  testOutput: string;
  contributionSummary: string;
}
