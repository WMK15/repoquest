import "server-only";

import type { RepositoryCampaign } from "@/lib/campaign/types";
import { createRepoQuestRuntime, type RepoQuestRuntime } from "../adapters/create-runtime";
import { getRegisteredRuntime } from "../adapters/runtime-registry";
import { ContributionMissionSchema } from "../domain/schemas";
import type { ContributionMission } from "../domain/types";
import { getRepoQuestMemoryStore } from "../memory/file-memory-store";
import { DefaultContributionService } from "./contribution-service";

export const DEFAULT_ENGINEER_ID = "local-engineer";

const MAX_ALLOWED_FILES = 4;
const MAX_RELEVANT_NODES = 3;
const MAX_RELEVANT_DOCUMENTS = 4;

function candidateFromCampaign(campaign: RepositoryCampaign, candidateId: string) {
  const matches = (campaign.contributionCandidates ?? []).filter(
    (candidate) => candidate.id === candidateId
  );
  if (matches.length !== 1) throw new Error("Unknown contribution candidate.");

  const selected = matches
    .map((candidate) => {
      if (
        !candidate ||
        !candidate.title.trim() ||
        !candidate.description.trim() ||
        !candidate.rationale.trim() ||
        !Array.isArray(candidate.paths) ||
        !Array.isArray(candidate.componentIds) ||
        !Array.isArray(candidate.evidenceIds) ||
        candidate.evidenceIds.length === 0
      ) {
        return undefined;
      }

      const allowedFiles = [...new Set(candidate.paths.map((path) => path.trim()).filter(Boolean))]
        .slice(0, MAX_ALLOWED_FILES);
      const relevantNodeIds = campaign.nodes
        .filter(
          (node) =>
            candidate.componentIds.includes(node.id) ||
            node.sourceFiles.some((file) => allowedFiles.includes(file))
        )
        .map((node) => node.id)
        .slice(0, MAX_RELEVANT_NODES);

      if (allowedFiles.length === 0 || relevantNodeIds.length === 0) return undefined;
      return { candidate, allowedFiles, relevantNodeIds };
    })
    .find((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  if (!selected) {
    throw new Error("The selected contribution candidate has an empty editable scope.");
  }
  return selected;
}

function nodeConfidence(confidence: RepositoryCampaign["nodes"][number]["confidence"]) {
  if (typeof confidence === "number") return confidence;
  return confidence === "high" ? 1 : confidence === "medium" ? 0.5 : 0;
}

function fallbackNode(campaign: RepositoryCampaign) {
  return campaign.nodes
    .map((node, index) => ({
      node,
      index,
      score: (node.status === "unknown" ? 0 : 2) + nodeConfidence(node.confidence),
    }))
    .filter(({ node }) => node.sourceFiles.some((path) => path.trim().length > 0))
    .sort((left, right) => right.score - left.score || left.index - right.index)[0]?.node;
}

export function missionFromCampaign(
  campaign: RepositoryCampaign,
  candidateId?: string
): ContributionMission {
  if (candidateId !== undefined && !candidateId.trim()) {
    throw new Error("Contribution candidate id cannot be empty.");
  }
  const selectedCandidate =
    candidateId === undefined
      ? undefined
      : candidateFromCampaign(campaign, candidateId.trim());
  const selectedNode = selectedCandidate ? undefined : fallbackNode(campaign);
  const relevantNodeIds = selectedCandidate?.relevantNodeIds ?? (selectedNode ? [selectedNode.id] : []);
  const allowedFiles =
    selectedCandidate?.allowedFiles ??
    selectedNode?.sourceFiles.map((path) => path.trim()).filter(Boolean).slice(0, MAX_ALLOWED_FILES) ??
    [];
  if (relevantNodeIds.length === 0 || allowedFiles.length === 0) {
    throw new Error("No safe contribution with a non-empty editable scope was found.");
  }
  const relevantDocuments = campaign.knowledgeArchive
    .filter(
      (document) =>
        document.relatedNodeIds.length === 0 ||
        document.relatedNodeIds.some((nodeId) => relevantNodeIds.includes(nodeId))
    )
    .slice(0, MAX_RELEVANT_DOCUMENTS)
    .map((document) => document.path);

  const candidate = selectedCandidate?.candidate;
  const nodeName = selectedNode?.label ?? campaign.repositoryName;
  return ContributionMissionSchema.parse({
    id: candidate?.id ?? `${campaign.mission.id}:bounded-fallback`,
    title: candidate?.title ?? `First contribution in ${nodeName}`,
    summary:
      candidate?.description ??
      `Investigate a small, reviewable contribution in ${nodeName} using the mapped repository evidence.`,
    objective: candidate
      ? `Plan and verify the proposed ${candidate.kind} contribution within the selected evidence-backed files.`
      : `Use the selected files to identify, plan, and verify one bounded improvement in ${nodeName}.`,
    nodeIds: relevantNodeIds,
    allowedFiles,
    relevantDocuments,
    recommendedGuidanceLevel: "assisted",
    reason:
      candidate?.rationale ??
      `${nodeName} is the strongest explored or high-confidence mapped area with editable source evidence; the file cap keeps the first contribution reviewable.`,
  });
}

export async function resolveRuntimeForContribution(sessionId: string): Promise<RepoQuestRuntime> {
  const session = await getRepoQuestMemoryStore().getSession(sessionId);
  if (!session) throw new Error("Unknown contribution session.");
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
