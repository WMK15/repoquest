import { z } from "zod";

export const RepoQuestModeSchema = z.enum(["live"]);

export const ContributionStageSchema = z.enum([
  "understanding",
  "investigating",
  "planning",
  "awaiting_plan_approval",
  "implementing",
  "awaiting_patch_approval",
  "verifying",
  "completed",
  "failed",
]);

export const GuidanceLevelSchema = z.enum([
  "guided",
  "assisted",
  "independent",
]);

export const ImplementationPlanSchema = z.object({
  id: z.string().min(1),
  missionId: z.string().min(1),
  summary: z.string().min(1),
  steps: z.array(
    z.object({
      id: z.string().min(1),
      description: z.string().min(1),
      files: z.array(z.string().min(1)),
      reason: z.string().min(1),
      status: z.enum(["pending", "active", "complete"]),
    })
  ),
  acceptanceCriteria: z.array(
    z.object({
      id: z.string().min(1),
      description: z.string().min(1),
    })
  ),
  expectedTests: z.array(z.string().min(1)),
  risks: z.array(z.string()),
});

export const ProposedPatchSchema = z.object({
  id: z.string().min(1),
  missionId: z.string().min(1),
  files: z.array(
    z.object({
      path: z.string().min(1),
      before: z.string(),
      after: z.string(),
      unifiedDiff: z.string(),
      explanation: z.string().min(1),
    })
  ),
  testsToRun: z.array(z.string().min(1)),
  createdAt: z.string().datetime(),
});

export const VerificationResultSchema = z.object({
  command: z.string().min(1),
  passed: z.boolean(),
  exitCode: z.number().int(),
  output: z.string(),
  criteria: z.array(
    z.object({
      id: z.string().min(1),
      description: z.string().min(1),
      passed: z.boolean(),
      evidence: z.string(),
    })
  ),
  changedFiles: z.array(z.string().min(1)),
  diff: z.string(),
  verifiedAt: z.string().datetime(),
});

export const ContributionSessionSchema = z.object({
  id: z.string().min(1),
  engineerId: z.string().min(1),
  repositoryId: z.string().min(1),
  repositoryCommitSha: z.string().min(1),
  missionId: z.string().min(1),
  stage: ContributionStageSchema,
  guidanceLevel: GuidanceLevelSchema,
  relevantNodeIds: z.array(z.string().min(1)),
  allowedFiles: z.array(z.string().min(1)),
  relevantDocuments: z.array(z.string().min(1)),
  implementationPlan: ImplementationPlanSchema.optional(),
  proposedPatch: ProposedPatchSchema.optional(),
  verification: VerificationResultSchema.optional(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
});

export const MasteryDimensionSchema = z.enum([
  "navigation",
  "documentation",
  "flow_tracing",
  "debugging",
  "implementation",
  "verification",
]);

export const MasteryLevelSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);

export const NodeMasterySchema = z.object({
  nodeId: z.string().min(1),
  dimensions: z.record(MasteryDimensionSchema, MasteryLevelSchema),
  status: z.enum(["unexplored", "discovered", "familiar", "proficient"]),
  evidenceEventIds: z.array(z.string().min(1)),
  lastDemonstratedAt: z.string().datetime().optional(),
  repositoryCommitSha: z.string().min(1),
  potentiallyStale: z.boolean(),
});

export const ContributionMissionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  objective: z.string().min(1),
  nodeIds: z.array(z.string().min(1)),
  allowedFiles: z.array(z.string().min(1)),
  relevantDocuments: z.array(z.string().min(1)),
  recommendedGuidanceLevel: GuidanceLevelSchema,
  reason: z.string().min(1),
});

export const VerifiedContributionSchema = z.object({
  sessionId: z.string().min(1),
  missionId: z.string().min(1),
  nodeIds: z.array(z.string().min(1)),
  changedFiles: z.array(z.string().min(1)),
  testCommand: z.string().min(1),
  guidanceLevel: GuidanceLevelSchema,
  verifiedAt: z.string().datetime(),
});

export const CompletedMissionSchema = z.object({
  sessionId: z.string().min(1),
  missionId: z.string().min(1),
  completedAt: z.string().datetime(),
});

export const EngineerRepositoryProfileSchema = z.object({
  engineerId: z.string().min(1),
  repositoryId: z.string().min(1),
  repositoryName: z.string().min(1),
  repositoryCommitSha: z.string().min(1),
  nodeMastery: z.array(NodeMasterySchema),
  completedMissions: z.array(CompletedMissionSchema),
  verifiedContributions: z.array(VerifiedContributionSchema),
  currentSessionId: z.string().min(1).optional(),
  recommendation: ContributionMissionSchema.nullable(),
  eventCount: z.number().int().nonnegative(),
  updatedAt: z.string().datetime(),
});

export const RepositoryIdentitySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  commitSha: z.string().min(1),
});
