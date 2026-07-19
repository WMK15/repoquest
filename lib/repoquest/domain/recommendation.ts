import { ContributionMissionSchema } from "./schemas";
import type {
  ContributionMission,
  EngineerRepositoryProfile,
  GuidanceLevel,
} from "./types";

const GUIDANCE_ORDER: GuidanceLevel[] = [
  "demonstrated",
  "guided",
  "assisted",
  "independent",
];

function nextGuidance(profile: EngineerRepositoryProfile): GuidanceLevel {
  const last = profile.verifiedContributions.at(-1)?.guidanceLevel ?? "demonstrated";
  return GUIDANCE_ORDER[Math.min(GUIDANCE_ORDER.indexOf(last) + 1, GUIDANCE_ORDER.length - 1)];
}

export function recommendNextContribution(
  profile: EngineerRepositoryProfile
): ContributionMission | null {
  const completedBrokenGate = profile.completedMissions.some(
    (mission) => mission.missionId === "mission-01"
  );

  if (completedBrokenGate) {
    return ContributionMissionSchema.parse({
      id: "fortify-access-gate",
      title: "Fortify the Access Gate",
      summary: "Add malformed Authorization header coverage around the repaired middleware boundary.",
      objective:
        "Protect the verified bearer-token flow with focused tests for missing, malformed, and unsupported Authorization headers.",
      nodeIds: ["access-gate", "token-service"],
      allowedFiles: [
        "src/middleware/require-auth.ts",
        "tests/authentication.test.ts",
      ],
      relevantDocuments: ["docs/authentication.md", "docs/ARCHITECTURE.md"],
      recommendedGuidanceLevel: nextGuidance(profile),
      reason:
        "The engineer has verified the happy-path correction; boundary-case coverage is the closest lower-guidance contribution.",
    });
  }

  const refresh = profile.nodeMastery.find((node) => node.potentiallyStale);
  if (refresh) {
    return ContributionMissionSchema.parse({
      id: `refresh-${refresh.nodeId}`,
      title: `Refresh ${refresh.nodeId}`,
      summary: "Revisit an area that changed after its recorded evidence was created.",
      objective: "Trace the current flow and verify that the previous mental model still matches the repository.",
      nodeIds: [refresh.nodeId],
      allowedFiles: [],
      relevantDocuments: [],
      recommendedGuidanceLevel: "assisted",
      reason: "The repository commit changed since this region was last demonstrated.",
    });
  }

  const nextNode = profile.nodeMastery.find((node) => node.status !== "proficient");
  if (!nextNode) return null;

  return ContributionMissionSchema.parse({
    id: `deepen-${nextNode.nodeId}`,
    title: `Deepen ${nextNode.nodeId}`,
    summary: "Turn repository navigation evidence into a verified contribution.",
    objective: "Read the relevant documentation, trace one flow, and prepare a bounded implementation plan.",
    nodeIds: [nextNode.nodeId],
    allowedFiles: [],
    relevantDocuments: [],
    recommendedGuidanceLevel: nextGuidance(profile),
    reason: `This region is currently ${nextNode.status} and has the clearest mastery gap.`,
  });
}
