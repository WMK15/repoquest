import { z } from "zod";
import type { RepoQuestEvent } from "./events";
import {
  CompletedMissionSchema,
  ContributionMissionSchema,
  ContributionSessionSchema,
  ContributionStageSchema,
  EngineerRepositoryProfileSchema,
  GuidanceLevelSchema,
  ImplementationPlanSchema,
  MasteryDimensionSchema,
  MasteryLevelSchema,
  NodeMasterySchema,
  ProposedPatchSchema,
  RepoQuestModeSchema,
  RepositoryIdentitySchema,
  VerificationResultSchema,
  VerifiedContributionSchema,
} from "./schemas";

export type RepoQuestMode = z.infer<typeof RepoQuestModeSchema>;
export type ContributionStage = z.infer<typeof ContributionStageSchema>;
export type GuidanceLevel = z.infer<typeof GuidanceLevelSchema>;
export type ImplementationPlan = z.infer<typeof ImplementationPlanSchema>;
export type ProposedPatch = z.infer<typeof ProposedPatchSchema>;
export type VerificationResult = z.infer<typeof VerificationResultSchema>;
export type ContributionSession = z.infer<typeof ContributionSessionSchema>;
export type MasteryDimension = z.infer<typeof MasteryDimensionSchema>;
export type MasteryLevel = z.infer<typeof MasteryLevelSchema>;
export type NodeMastery = z.infer<typeof NodeMasterySchema>;
export type ContributionMission = z.infer<typeof ContributionMissionSchema>;
export type VerifiedContribution = z.infer<typeof VerifiedContributionSchema>;
export type CompletedMission = z.infer<typeof CompletedMissionSchema>;
export type EngineerRepositoryProfile = z.infer<typeof EngineerRepositoryProfileSchema>;
export type RepositoryIdentity = z.infer<typeof RepositoryIdentitySchema>;
export type { RepoQuestEvent };
