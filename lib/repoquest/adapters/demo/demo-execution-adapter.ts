import "server-only";

import { applyApprovedFix, APPROVED_FIX } from "@/lib/repository/apply-fix";
import { resetDemoRepo } from "@/lib/repository/reset-repository";
import { runDemoRepoTests } from "@/lib/repository/run-tests";
import { VerificationResultSchema } from "../../domain/schemas";
import type { ProposedPatch } from "../../domain/types";
import type { ExecutionAdapter } from "../types";

export class DemoExecutionAdapter implements ExecutionAdapter {
  async applyApprovedPatch(patch: ProposedPatch) {
    const file = patch.files[0];
    if (
      patch.files.length !== 1 ||
      file.path !== APPROVED_FIX.file ||
      file.before !== APPROVED_FIX.before ||
      file.after !== APPROVED_FIX.after
    ) {
      throw new Error("The proposed patch is outside the approved demo mission scope.");
    }
    const result = await applyApprovedFix();
    return {
      patchId: patch.id,
      applied: result.applied,
      alreadyApplied: result.alreadyFixed,
      changedFiles: [APPROVED_FIX.file],
      diff: result.diff,
    };
  }

  async runAllowedTests(commands: string[]) {
    if (commands.length !== 1 || commands[0] !== "npm test") {
      throw new Error("PulseBoard only permits the mission test command: npm test");
    }
    const result = await runDemoRepoTests();
    return VerificationResultSchema.parse({
      command: result.command,
      passed: result.success,
      exitCode: result.success ? 0 : 1,
      output: result.output,
      criteria: [
        {
          id: "suite-passes",
          description: "All PulseBoard authentication tests pass.",
          passed: result.success,
          evidence: result.summary,
        },
      ],
      changedFiles: [APPROVED_FIX.file],
      diff: "",
      verifiedAt: new Date().toISOString(),
    });
  }

  async resetWorkspace() {
    await resetDemoRepo();
  }
}
