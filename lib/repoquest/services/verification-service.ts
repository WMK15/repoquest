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
        passed: false,
        evidence: "No executable command validates this semantic criterion; explicit manual validation is required.",
      }));
      criteria.unshift({
        id: "changed-files-within-scope",
        description: "Changed files remain within the approved contribution scope.",
        passed: withinScope,
        evidence: withinScope
          ? "The proposed patch only references approved files."
          : "The proposed patch includes files outside the contribution scope.",
      });

      return VerificationResultSchema.parse({
        command: "Manual scope validation",
        passed: false,
        exitCode: 1,
        output:
          "No executable verification commands were provided. File scope was reviewed, but semantic acceptance criteria still require explicit manual validation.",
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
    const acceptanceCriteria = session.implementationPlan.acceptanceCriteria.map((criterion) => ({
      ...criterion,
      passed: result.passed && withinScope,
      evidence: result.passed
        ? "All approved verification commands passed and changed files remained in scope."
        : "One or more approved verification commands failed; review the command evidence.",
    }));
    const criteria = [
      ...result.criteria,
      {
        id: "changed-files-within-scope",
        description: "Changed files remain within the approved contribution scope.",
        passed: withinScope,
        evidence: withinScope
          ? "All changed files are in the approved contribution scope."
          : "The proposed patch includes files outside the contribution scope.",
      },
      ...acceptanceCriteria,
    ];

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
