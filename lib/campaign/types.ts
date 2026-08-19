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

export const NodeConfidenceSchema = z.union([
  z.enum(["low", "medium", "high"]),
  z.number().min(0).max(1),
]);
export type NodeConfidence = z.infer<typeof NodeConfidenceSchema>;

export const CampaignEvidenceSchema = z.object({
  id: z.string(),
  path: z.string(),
  lines: z.object({
    start: z.number().int().positive(),
    end: z.number().int().positive(),
  }),
  claim: z.string(),
  excerpt: z.string().optional(),
  detectorId: z.string().optional(),
});
export type CampaignEvidence = z.infer<typeof CampaignEvidenceSchema>;

export const CampaignNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  gameLabel: z.string(),
  description: z.string(),
  status: NodeStatusSchema,
  sourceFiles: z.array(z.string()),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
  category: z.string().optional(),
  technologies: z.array(z.string()).optional(),
  purpose: z.string().optional(),
  confidence: NodeConfidenceSchema.optional(),
  responsibilities: z.array(z.string()).optional(),
  entryPoints: z.array(z.string()).optional(),
  dependencies: z.array(z.string()).optional(),
  editGuidance: z.string().optional(),
  uncertainties: z.array(z.string()).optional(),
  detectorIds: z.array(z.string()).optional(),
  evidenceIds: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
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
  kind: z.string().optional(),
  evidenceIds: z.array(z.string()).optional(),
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

export const AnalysisCoverageAreaSchema = z.enum([
  "frontend",
  "backend",
  "database",
  "logging",
  "metrics",
  "tracing",
  "alerts",
  "external-services",
  "infrastructure",
  "ci",
]);
export type AnalysisCoverageArea = z.infer<typeof AnalysisCoverageAreaSchema>;

export const AnalysisCoverageStatusSchema = z.enum([
  "found",
  "not-detected",
  "uncertain",
  "unsupported",
  "analysis-limited",
]);
export type AnalysisCoverageStatus = z.infer<typeof AnalysisCoverageStatusSchema>;

export const AnalysisCoverageEntrySchema = z.object({
  area: AnalysisCoverageAreaSchema,
  status: AnalysisCoverageStatusSchema,
  summary: z.string().optional(),
  evidence: z.array(z.string()).optional(),
  componentIds: z.array(z.string()).optional(),
});
export type AnalysisCoverageEntry = z.infer<typeof AnalysisCoverageEntrySchema>;

export const WalkthroughFlowStepSchema = z.object({
  instruction: z.string(),
  componentId: z.string().optional(),
});
export type WalkthroughFlowStep = z.infer<typeof WalkthroughFlowStepSchema>;

export const GuidedWalkthroughSectionSchema = z.object({
  id: z.string(),
  order: z.number().int().nonnegative(),
  title: z.string(),
  objective: z.string(),
  componentIds: z.array(z.string()),
  flowSteps: z.array(WalkthroughFlowStepSchema),
  completionRequirements: z.array(z.string()),
  evidenceRequirements: z.array(z.string()),
});
export type GuidedWalkthroughSection = z.infer<typeof GuidedWalkthroughSectionSchema>;

export const CampaignContributionCandidateSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  kind: z.enum(["bug", "documentation", "test", "refactor", "feature", "maintenance"]),
  difficulty: z.enum(["starter", "intermediate", "advanced"]),
  paths: z.array(z.string().trim().min(1)).min(1),
  componentIds: z.array(z.string().trim().min(1)).min(1),
  rationale: z.string().trim().min(1),
  evidenceIds: z.array(z.string().trim().min(1)).min(1),
});
export type CampaignContributionCandidate = z.infer<
  typeof CampaignContributionCandidateSchema
>;

export const RepositoryCampaignSchema = z.object({
  repositoryName: z.string(),
  summary: z.string(),
  nodes: z.array(CampaignNodeSchema),
  edges: z.array(CampaignEdgeSchema),
  knowledgeArchive: z.array(KnowledgeDocSchema),
  contradictions: z.array(ContradictionSchema),
  mission: MissionSchema,
  evidence: z.array(CampaignEvidenceSchema).optional(),
  analysisCoverage: z.array(AnalysisCoverageEntrySchema).optional(),
  guidedWalkthrough: z.array(GuidedWalkthroughSectionSchema).optional(),
  contributionCandidates: z.array(CampaignContributionCandidateSchema).optional(),
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
