import "server-only";

import type { RepositoryCampaign } from "@/lib/campaign/types";
import { createRepoQuestRuntime, type RepoQuestRuntime } from "../adapters/create-runtime";
import { getRegisteredRuntime } from "../adapters/runtime-registry";
import { ContributionMissionSchema } from "../domain/schemas";
import type { ContributionMission } from "../domain/types";
import { getRepoQuestMemoryStore } from "../memory/file-memory-store";
import { DefaultContributionService } from "./contribution-service";

export const DEFAULT_ENGINEER_ID = "local-engineer";

export function missionFromCampaign(campaign: RepositoryCampaign): ContributionMission {
  const demoMission = campaign.mission.id === "mission-01";
  const relevantNodeIds = demoMission
    ? ["authentication-route", "token-service", "access-gate"]
    : campaign.nodes.map((node) => node.id);
  const relevantNodes = campaign.nodes.filter((node) => relevantNodeIds.includes(node.id));
  return ContributionMissionSchema.parse({
    id: campaign.mission.id,
    title: campaign.mission.title,
    summary: campaign.mission.narrative,
    objective: campaign.mission.objective,
    nodeIds: relevantNodeIds,
    allowedFiles: [
      ...new Set([
        ...relevantNodes.flatMap((node) => node.sourceFiles),
        ...(demoMission ? ["tests/authentication.test.ts"] : []),
      ]),
    ],
    relevantDocuments: campaign.knowledgeArchive
      .filter(
        (document) =>
          demoMission ||
          document.relatedNodeIds.length === 0 ||
          document.relatedNodeIds.some((nodeId) => relevantNodeIds.includes(nodeId))
      )
      .map((document) => document.path),
    recommendedGuidanceLevel: demoMission ? "guided" : "assisted",
    reason: demoMission
      ? "Trace the authentication boundary and verify the smallest safe correction."
      : "Build a documented mental model before proposing a bounded contribution.",
  });
}

export async function resolveRuntimeForContribution(sessionId: string): Promise<RepoQuestRuntime> {
  const session = await getRepoQuestMemoryStore().getSession(sessionId);
  if (!session) throw new Error("Unknown contribution session.");
  if (session.repositoryId === "pulseboard") {
    return createRepoQuestRuntime({
      mode: "demo",
      engineerId: session.engineerId,
      repositoryId: session.repositoryId,
    });
  }
  const descriptor = await getRegisteredRuntime(session.repositoryId);
  if (!descriptor?.repositoryRoot) {
    throw new Error("The live repository workspace is no longer available for this contribution.");
  }
  return createRepoQuestRuntime({
    mode: descriptor.mode,
    engineerId: session.engineerId,
    repositoryId: descriptor.repositoryId,
    repositoryRoot: descriptor.repositoryRoot,
    repositoryName: descriptor.repositoryName,
  });
}

export async function resolveContributionService(sessionId: string) {
  return new DefaultContributionService(await resolveRuntimeForContribution(sessionId));
}
