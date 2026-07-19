import { NodeMasterySchema } from "./schemas";
import type {
  ContributionSession,
  GuidanceLevel,
  MasteryDimension,
  MasteryLevel,
  NodeMastery,
  RepoQuestEvent,
} from "./types";

const DIMENSIONS: MasteryDimension[] = [
  "navigation",
  "documentation",
  "flow_tracing",
  "debugging",
  "implementation",
  "verification",
];

const GUIDANCE_RANK: Record<GuidanceLevel, number> = {
  demonstrated: 0,
  guided: 1,
  assisted: 2,
  independent: 3,
};

interface MutableMastery {
  nodeId: string;
  dimensions: Record<MasteryDimension, MasteryLevel>;
  evidenceEventIds: string[];
  lastDemonstratedAt?: string;
  relevantCommitShas: Set<string>;
  verifiedGuidanceRanks: number[];
}

function blankMastery(nodeId: string): MutableMastery {
  return {
    nodeId,
    dimensions: Object.fromEntries(DIMENSIONS.map((dimension) => [dimension, 0])) as Record<
      MasteryDimension,
      MasteryLevel
    >,
    evidenceEventIds: [],
    relevantCommitShas: new Set(),
    verifiedGuidanceRanks: [],
  };
}

function statusFor(dimensions: Record<MasteryDimension, MasteryLevel>, hasEvidence: boolean) {
  if (!hasEvidence) return "unexplored" as const;
  if (
    dimensions.flow_tracing >= 2 &&
    dimensions.debugging >= 1 &&
    dimensions.implementation >= 2 &&
    dimensions.verification >= 2
  ) {
    return "proficient" as const;
  }
  if (dimensions.documentation >= 1 && dimensions.flow_tracing >= 2) {
    return "familiar" as const;
  }
  return "discovered" as const;
}

export function projectNodeMastery(input: {
  events: RepoQuestEvent[];
  sessions: ContributionSession[];
  repositoryCommitSha: string;
  knownNodeIds?: string[];
}): NodeMastery[] {
  const sessions = new Map(input.sessions.map((session) => [session.id, session]));
  const mastery = new Map<string, MutableMastery>();

  const ensure = (nodeId: string) => {
    const existing = mastery.get(nodeId) ?? blankMastery(nodeId);
    mastery.set(nodeId, existing);
    return existing;
  };

  for (const nodeId of input.knownNodeIds ?? []) ensure(nodeId);

  const record = (nodeId: string, event: RepoQuestEvent) => {
    const node = ensure(nodeId);
    if (!node.evidenceEventIds.includes(event.id)) node.evidenceEventIds.push(event.id);
    const session = sessions.get(event.sessionId);
    if (session) node.relevantCommitShas.add(session.repositoryCommitSha);
    return node;
  };

  for (const event of input.events) {
    const session = sessions.get(event.sessionId);
    switch (event.type) {
      case "NODE_EXPLORED": {
        const node = record(event.nodeId, event);
        node.dimensions.navigation = Math.max(node.dimensions.navigation, 1) as MasteryLevel;
        break;
      }
      case "DOCUMENT_READ":
        for (const nodeId of event.nodeIds) {
          const node = record(nodeId, event);
          node.dimensions.documentation = Math.max(
            node.dimensions.documentation,
            1
          ) as MasteryLevel;
        }
        break;
      case "FLOW_TRACED":
        for (const nodeId of event.nodeIds) {
          const node = record(nodeId, event);
          node.dimensions.flow_tracing = Math.max(node.dimensions.flow_tracing, 2) as MasteryLevel;
          node.dimensions.navigation = Math.max(node.dimensions.navigation, 2) as MasteryLevel;
        }
        break;
      case "CHALLENGE_COMPLETED":
        if (event.correct) {
          for (const nodeId of event.nodeIds) {
            const node = record(nodeId, event);
            node.dimensions.debugging = Math.max(node.dimensions.debugging, 1) as MasteryLevel;
          }
        }
        break;
      case "READY_TO_IMPLEMENT":
        for (const nodeId of event.nodeIds) {
          const node = record(nodeId, event);
          node.dimensions.flow_tracing = Math.max(node.dimensions.flow_tracing, 1) as MasteryLevel;
          node.dimensions.navigation = Math.max(node.dimensions.navigation, 2) as MasteryLevel;
        }
        break;
      case "PATCH_APPLIED":
        for (const nodeId of session?.relevantNodeIds ?? []) {
          const node = record(nodeId, event);
          node.dimensions.implementation = Math.max(
            node.dimensions.implementation,
            1
          ) as MasteryLevel;
        }
        break;
      case "CONTRIBUTION_VERIFIED":
        for (const nodeId of event.nodeIds) {
          const node = record(nodeId, event);
          const rank = GUIDANCE_RANK[event.guidanceLevel];
          const lowerGuidanceThanBefore = node.verifiedGuidanceRanks.some(
            (previousRank) => rank > previousRank
          );
          const verifiedLevel = event.guidanceLevel === "demonstrated" ? 1 : 2;
          node.dimensions.implementation = Math.max(
            node.dimensions.implementation,
            lowerGuidanceThanBefore ? 3 : verifiedLevel
          ) as MasteryLevel;
          node.dimensions.verification = Math.max(
            node.dimensions.verification,
            lowerGuidanceThanBefore ? 3 : verifiedLevel
          ) as MasteryLevel;
          node.verifiedGuidanceRanks.push(rank);
          node.lastDemonstratedAt = event.occurredAt;
        }
        break;
      default:
        break;
    }
  }

  return [...mastery.values()]
    .map((node) =>
      NodeMasterySchema.parse({
        nodeId: node.nodeId,
        dimensions: node.dimensions,
        status: statusFor(node.dimensions, node.evidenceEventIds.length > 0),
        evidenceEventIds: node.evidenceEventIds,
        lastDemonstratedAt: node.lastDemonstratedAt,
        repositoryCommitSha: input.repositoryCommitSha,
        potentiallyStale:
          node.relevantCommitShas.size > 0 &&
          !node.relevantCommitShas.has(input.repositoryCommitSha),
      })
    )
    .sort((a, b) => a.nodeId.localeCompare(b.nodeId));
}
