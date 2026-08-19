import { describe, expect, test, vi } from "vitest";
import type { RepoQuestRuntime } from "../lib/repoquest/adapters/create-runtime";
import { createRepoQuestEvent } from "../lib/repoquest/domain/events";
import { ContributionSessionSchema } from "../lib/repoquest/domain/schemas";
import { VerificationService } from "../lib/repoquest/services/verification-service";

describe("VerificationService", () => {
  test("records no-command verification as manual scope validation without passing semantic criteria", async () => {
    const session = ContributionSessionSchema.parse({
      id: "session-1",
      engineerId: "engineer-1",
      repositoryId: "repository-1",
      repositoryCommitSha: "abc123",
      missionId: "mission-1",
      stage: "verifying",
      guidanceLevel: "guided",
      relevantNodeIds: ["node-1"],
      allowedFiles: ["src/a.ts"],
      relevantDocuments: [],
      implementationPlan: {
        id: "plan-1",
        missionId: "mission-1",
        summary: "Update the behavior.",
        steps: [],
        acceptanceCriteria: [{ id: "criterion-1", description: "The behavior is correct." }],
        expectedTests: ["No executable tests required."],
        risks: [],
      },
      proposedPatch: {
        id: "patch-1",
        missionId: "mission-1",
        files: [
          {
            path: "src/a.ts",
            before: "before",
            after: "after",
            unifiedDiff: "diff",
            explanation: "Update behavior.",
          },
        ],
        testsToRun: [],
        createdAt: new Date().toISOString(),
      },
      startedAt: new Date().toISOString(),
    });
    const runtime = {
      repository: { getDiff: vi.fn().mockResolvedValue("diff") },
    } as unknown as RepoQuestRuntime;
    const events = [
      createRepoQuestEvent({
        type: "PATCH_APPLIED",
        sessionId: session.id,
        patchId: session.proposedPatch!.id,
        changedFiles: ["src/a.ts"],
      }),
    ];

    const result = await new VerificationService(runtime).verify(session, events);

    expect(result.passed).toBe(false);
    expect(result.command).toBe("Manual scope validation");
    expect(result.criteria).toEqual([
      expect.objectContaining({ id: "changed-files-within-scope", passed: true }),
      expect.objectContaining({ id: "criterion-1", passed: false }),
    ]);
  });
});
