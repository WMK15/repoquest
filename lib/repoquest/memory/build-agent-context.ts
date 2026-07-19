import type {
  ContributionSession,
  EngineerRepositoryProfile,
  NodeMastery,
} from "../domain/types";

const DIMENSION_LABELS = {
  navigation: "Navigated the region",
  documentation: "Read linked documentation",
  flow_tracing: "Traced a repository flow",
  debugging: "Completed debugging evidence",
  implementation: "Applied implementation evidence",
  verification: "Verified the contribution with execution",
} as const;

function masterySummary(node: NodeMastery): string {
  const evidence = Object.entries(node.dimensions)
    .filter(([, level]) => level > 0)
    .map(([dimension]) => `- ${DIMENSION_LABELS[dimension as keyof typeof DIMENSION_LABELS]}`)
    .join("\n");
  return `${node.nodeId}${node.potentiallyStale ? " (potentially stale)" : ""}\n${evidence}`;
}

export function buildAgentContext(
  profile: EngineerRepositoryProfile,
  session?: ContributionSession | null
): string {
  const proficient = profile.nodeMastery
    .filter((node) => node.status === "proficient")
    .map(masterySummary)
    .join("\n\n");
  const familiar = profile.nodeMastery
    .filter((node) => node.status === "familiar")
    .map(masterySummary)
    .join("\n\n");
  const guidance = profile.verifiedContributions
    .map((contribution) => `${contribution.missionId}: ${contribution.guidanceLevel}`)
    .join("\n");

  return `# Engineer progress

Repository: ${profile.repositoryName}
Indexed commit: ${profile.repositoryCommitSha}

## Proficient regions
${proficient || "None yet"}

## Familiar regions
${familiar || "None yet"}

## Current contribution
${session ? `${session.missionId}\nStage: ${session.stage}` : "No active contribution"}

## Guidance history
${guidance || "No verified contributions yet"}

## Recommended next work
${profile.recommendation ? `${profile.recommendation.title}\n${profile.recommendation.objective}` : "No recommendation yet"}`;
}
