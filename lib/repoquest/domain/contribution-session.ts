import { ContributionSessionSchema } from "./schemas";
import type { ContributionSession, GuidanceLevel } from "./types";

export interface CreateContributionSessionInput {
  id?: string;
  engineerId: string;
  repositoryId: string;
  repositoryCommitSha: string;
  missionId: string;
  guidanceLevel?: GuidanceLevel;
  relevantNodeIds: string[];
  allowedFiles: string[];
  relevantDocuments: string[];
  startedAt?: string;
}

export function createContributionSession(
  input: CreateContributionSessionInput
): ContributionSession {
  return ContributionSessionSchema.parse({
    id: input.id ?? crypto.randomUUID(),
    engineerId: input.engineerId,
    repositoryId: input.repositoryId,
    repositoryCommitSha: input.repositoryCommitSha,
    missionId: input.missionId,
    stage: "understanding",
    guidanceLevel: input.guidanceLevel ?? "guided",
    relevantNodeIds: [...new Set(input.relevantNodeIds)],
    allowedFiles: [...new Set(input.allowedFiles)],
    relevantDocuments: [...new Set(input.relevantDocuments)],
    startedAt: input.startedAt ?? new Date().toISOString(),
  });
}
