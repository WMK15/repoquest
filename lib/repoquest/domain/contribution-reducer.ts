import { ContributionSessionSchema } from "./schemas";
import type { ContributionSession, RepoQuestEvent } from "./types";

export function reduceContributionSession(
  initialSession: ContributionSession,
  events: RepoQuestEvent[]
): ContributionSession {
  const session = events
    .filter((event) => event.sessionId === initialSession.id)
    .reduce<ContributionSession>((current, event) => {
      switch (event.type) {
        case "MISSION_STARTED":
          return { ...current, stage: "understanding" };
        case "NODE_EXPLORED":
        case "DOCUMENT_READ":
          return current;
        case "FLOW_TRACED":
          return { ...current, stage: "investigating" };
        case "CHALLENGE_COMPLETED":
          return event.correct ? { ...current, stage: "planning" } : current;
        case "READY_TO_IMPLEMENT":
          return { ...current, stage: "planning" };
        case "PLAN_GENERATED":
          return { ...current, stage: "awaiting_plan_approval" };
        case "PLAN_APPROVED":
          return { ...current, stage: "implementing" };
        case "PATCH_PROPOSED":
          return { ...current, stage: "awaiting_patch_approval" };
        case "PATCH_APPROVED":
          return { ...current, stage: "implementing" };
        case "PATCH_APPLIED":
          return { ...current, stage: "verifying" };
        case "TEST_EXECUTED":
          return { ...current, stage: event.passed ? "verifying" : "failed" };
        case "CONTRIBUTION_VERIFIED":
        case "MISSION_COMPLETED":
          return {
            ...current,
            stage: "completed",
            completedAt: event.occurredAt,
          };
      }
    }, initialSession);

  return ContributionSessionSchema.parse(session);
}
