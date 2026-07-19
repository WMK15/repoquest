import { EngineerRepositoryProfileSchema } from "./schemas";
import { projectNodeMastery } from "./mastery-projection";
import { recommendNextContribution } from "./recommendation";
import type {
  ContributionSession,
  EngineerRepositoryProfile,
  RepoQuestEvent,
} from "./types";

export function buildEngineerProfile(input: {
  engineerId: string;
  repositoryId: string;
  repositoryName: string;
  repositoryCommitSha: string;
  events: RepoQuestEvent[];
  sessions: ContributionSession[];
  knownNodeIds?: string[];
  updatedAt?: string;
}): EngineerRepositoryProfile {
  const scopedSessions = input.sessions.filter(
    (session) =>
      session.engineerId === input.engineerId &&
      session.repositoryId === input.repositoryId
  );
  const sessionIds = new Set(scopedSessions.map((session) => session.id));
  const events = input.events.filter((event) => sessionIds.has(event.sessionId));

  const profile = EngineerRepositoryProfileSchema.parse({
    engineerId: input.engineerId,
    repositoryId: input.repositoryId,
    repositoryName: input.repositoryName,
    repositoryCommitSha: input.repositoryCommitSha,
    nodeMastery: projectNodeMastery({
      events,
      sessions: scopedSessions,
      repositoryCommitSha: input.repositoryCommitSha,
      knownNodeIds: input.knownNodeIds,
    }),
    completedMissions: events
      .filter((event) => event.type === "MISSION_COMPLETED")
      .map((event) => ({
        sessionId: event.sessionId,
        missionId: event.missionId,
        completedAt: event.occurredAt,
      })),
    verifiedContributions: events
      .filter((event) => event.type === "CONTRIBUTION_VERIFIED")
      .map((event) => ({
        sessionId: event.sessionId,
        missionId: event.missionId,
        nodeIds: event.nodeIds,
        changedFiles: event.changedFiles,
        testCommand: event.testCommand,
        guidanceLevel: event.guidanceLevel,
        verifiedAt: event.occurredAt,
      })),
    currentSessionId: [...scopedSessions]
      .reverse()
      .find((session) => session.stage !== "completed")?.id,
    recommendation: null,
    eventCount: events.length,
    updatedAt: input.updatedAt ?? new Date().toISOString(),
  });

  return EngineerRepositoryProfileSchema.parse({
    ...profile,
    recommendation: recommendNextContribution(profile),
  });
}
