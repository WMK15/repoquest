import type { RepoQuestRuntime } from "../adapters/create-runtime";
import { VerificationResultSchema } from "../domain/schemas";
import type { ContributionSession, RepoQuestEvent } from "../domain/types";

export class VerificationService {
  constructor(private readonly runtime: RepoQuestRuntime) {}

  async verify(session: ContributionSession, events: RepoQuestEvent[]) {
    if (!session.implementationPlan || !session.proposedPatch) {
      throw new Error("Plan and patch evidence are required before verification.");
    }
    const patchApplied = events.some(
      (event) =>
        event.sessionId === session.id &&
        event.type === "PATCH_APPLIED" &&
        event.patchId === session.proposedPatch?.id
    );
    if (!patchApplied) throw new Error("The approved patch has not been applied.");

    const noExecutableTestPattern = /^(n\/a|none\b|no executable tests?|no tests?)/i;
    const expectedTests = session.implementationPlan.expectedTests;
    const executableTests = expectedTests.filter(
      (command) => !noExecutableTestPattern.test(command.trim())
    );
    const hasNoExecutableTestExpectation =
      expectedTests.length > 0 && executableTests.length === 0;

    if (hasNoExecutableTestExpectation) {
      const changedFiles = session.proposedPatch.files.map((file) => file.path);
      const withinScope = changedFiles.every((file) => session.allowedFiles.includes(file));
      const criteria = session.implementationPlan.acceptanceCriteria.map((criterion) => ({
        ...criterion,
        passed: withinScope,
        evidence: withinScope
          ? "Reviewed plan and proposed patch evidence; no executable verification command was required."
          : "The proposed patch includes files outside the contribution scope.",
      }));

      return VerificationResultSchema.parse({
        command: "Evidence review",
        passed: withinScope && criteria.every((criterion) => criterion.passed),
        exitCode: 0,
        output: "No executable tests were required for this exploration mission.",
        criteria,
        changedFiles,
        diff: await this.runtime.repository.getDiff(),
        verifiedAt: new Date().toISOString(),
      });
    }

    if (executableTests.length === 0) {
      throw new Error("No executable verification command was provided.");
    }

    if (!this.runtime.capabilities.canRunTests) {
      throw new Error("Test execution is unavailable for this repository runtime.");
    }

    const result = await this.runtime.execution.runAllowedTests(
      executableTests
    );
    const diff = await this.runtime.repository.getDiff();
    const changedFiles = session.proposedPatch.files.map((file) => file.path);
    const withinScope = changedFiles.every((file) => session.allowedFiles.includes(file));
    const criteria = session.implementationPlan.acceptanceCriteria.map((criterion) => ({
      ...criterion,
      passed: result.passed && withinScope,
      evidence: result.passed
        ? `${result.command} exited with ${result.exitCode}.`
        : result.output.slice(-1_000),
    }));

    return VerificationResultSchema.parse({
      ...result,
      passed:
        result.passed &&
        withinScope &&
        criteria.every((criterion) => criterion.passed),
      criteria,
      changedFiles,
      diff,
    });
  }
}
