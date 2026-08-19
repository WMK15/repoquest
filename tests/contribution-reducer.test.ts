import { describe, expect, test } from "vitest";
import { reduceContributionSession } from "../lib/repoquest/domain/contribution-reducer";
import { createContributionSession } from "../lib/repoquest/domain/contribution-session";
import { createRepoQuestEvent } from "../lib/repoquest/domain/events";

describe("contribution verification recovery", () => {
  test("moves a failed verification back to verifying when a retry passes", () => {
    const session = createContributionSession({
      id: "session-1",
      engineerId: "engineer-1",
      repositoryId: "repository-1",
      repositoryCommitSha: "abc123",
      missionId: "mission-1",
      relevantNodeIds: ["node-1"],
      allowedFiles: ["src/a.ts"],
      relevantDocuments: [],
    });
    const events = [
      createRepoQuestEvent({
        type: "TEST_EXECUTED",
        sessionId: session.id,
        command: "npm test",
        passed: false,
        exitCode: 1,
      }),
      createRepoQuestEvent({
        type: "TEST_EXECUTED",
        sessionId: session.id,
        command: "npm test",
        passed: true,
        exitCode: 0,
      }),
    ];

    expect(reduceContributionSession(session, events).stage).toBe("verifying");
  });
});
