import { z } from "zod";
import type { RepositoryCampaign } from "@/lib/campaign/types";
import type { MarkdownDocument } from "@/lib/repository/read-markdown";
import type {
  ContributionMission,
  ContributionSession,
  ImplementationPlan,
  ProposedPatch,
  RepositoryIdentity,
  VerificationResult,
} from "../domain/types";

export const repoQuestFeatures = [
  "repository-map",
  "markdown-archive",
  "guided-investigation",
  "implementation-plan",
  "patch-preview",
  "human-approval",
  "real-test-verification",
  "mastery-evidence",
  "persistent-memory",
  "next-contribution",
] as const;

export type RepoQuestFeature = (typeof repoQuestFeatures)[number];
export type FeatureSupport = "supported" | "degraded" | "unavailable";

export const RuntimeCapabilitiesSchema = z.object({
  canReadRepository: z.boolean(),
  canWriteRepository: z.boolean(),
  canRunTests: z.boolean(),
  canStreamAgentActivity: z.boolean(),
  canPersistMemory: z.boolean(),
  canCreateBranches: z.boolean(),
  canGenerateLiveRecommendations: z.boolean(),
});

export type RuntimeCapabilities = z.infer<typeof RuntimeCapabilitiesSchema>;
export type FeatureStatus = Record<RepoQuestFeature, FeatureSupport>;

export interface RepositoryIndex {
  sourceFiles: string[];
  markdownFiles: string[];
  totalFiles: number;
}

export type RepositoryDocument = MarkdownDocument;

export interface SourceEvidence {
  path: string;
  content: string;
}

export interface CampaignInput {
  repository: RepositoryIdentity;
  index: RepositoryIndex;
  documents: RepositoryDocument[];
  testOutput?: string;
  emitActivity?: (message: string) => void;
}

export interface PlanInput {
  session: ContributionSession;
  mission: ContributionMission;
  repositorySummary: string;
  sourceFiles: SourceEvidence[];
  documents: RepositoryDocument[];
  engineerContext: string;
}

export interface PatchInput extends PlanInput {
  plan: ImplementationPlan;
}

export interface VerificationInput {
  session: ContributionSession;
  verification: VerificationResult;
  engineerContext: string;
}

export interface VerificationExplanation {
  summary: string;
  evidence: string[];
  remainingRisk: string;
}

export interface AppliedPatchResult {
  patchId: string;
  applied: boolean;
  alreadyApplied: boolean;
  changedFiles: string[];
  diff: string;
}

export interface RepositoryAdapter {
  getRepositoryIdentity(): Promise<RepositoryIdentity>;
  scanRepository(): Promise<RepositoryIndex>;
  readFile(path: string): Promise<string>;
  readDocuments(): Promise<RepositoryDocument[]>;
  getDiff(): Promise<string>;
}

export interface AgentAdapter {
  generateCampaign(input: CampaignInput): Promise<RepositoryCampaign>;
  generateImplementationPlan(input: PlanInput): Promise<ImplementationPlan>;
  proposePatch(input: PatchInput): Promise<ProposedPatch>;
  explainVerification(input: VerificationInput): Promise<VerificationExplanation>;
}

export interface ExecutionAdapter {
  applyApprovedPatch(patch: ProposedPatch): Promise<AppliedPatchResult>;
  runAllowedTests(commands: string[]): Promise<VerificationResult>;
  resetWorkspace(): Promise<void>;
}
