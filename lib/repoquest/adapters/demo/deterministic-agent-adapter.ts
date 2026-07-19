import "server-only";

import { buildDeterministicCampaign } from "@/lib/campaign/deterministic-campaign";
import { APPROVED_FIX } from "@/lib/repository/apply-fix";
import {
  ImplementationPlanSchema,
  ProposedPatchSchema,
} from "../../domain/schemas";
import type {
  AgentAdapter,
  PatchInput,
  PlanInput,
  VerificationInput,
} from "../types";

export class DeterministicAgentAdapter implements AgentAdapter {
  async generateCampaign() {
    return buildDeterministicCampaign();
  }

  async generateImplementationPlan(input: PlanInput) {
    return ImplementationPlanSchema.parse({
      id: `plan-${input.session.id}`,
      missionId: input.session.missionId,
      summary:
        "Correct bearer-token extraction at the Access Gate, then verify the full authentication request path.",
      steps: [
        {
          id: "confirm-boundary",
          description: "Confirm the documented Authorization header contract and current middleware extraction.",
          files: ["docs/authentication.md", "src/middleware/require-auth.ts"],
          reason: "The change must stay at the middleware boundary rather than weakening token verification.",
          status: "pending",
        },
        {
          id: "apply-correction",
          description: "Extract the credential after the Bearer scheme.",
          files: [APPROVED_FIX.file],
          reason: "The verifier expects the token, not the scheme name.",
          status: "pending",
        },
        {
          id: "verify-flow",
          description: "Run the complete PulseBoard authentication test suite.",
          files: ["tests/authentication.test.ts"],
          reason: "A passing integration request is the required execution evidence.",
          status: "pending",
        },
      ],
      acceptanceCriteria: [
        {
          id: "valid-bearer-request",
          description: "A valid Bearer token reaches the protected resource with status 200.",
        },
        {
          id: "suite-passes",
          description: "All PulseBoard authentication tests pass.",
        },
      ],
      expectedTests: ["npm test"],
      risks: [
        "Changing token verification instead of extraction would weaken the security boundary.",
      ],
    });
  }

  async proposePatch(input: PatchInput) {
    return ProposedPatchSchema.parse({
      id: `patch-${input.session.id}`,
      missionId: input.session.missionId,
      files: [
        {
          path: APPROVED_FIX.file,
          before: APPROVED_FIX.before,
          after: APPROVED_FIX.after,
          unifiedDiff: `--- a/${APPROVED_FIX.file}\n+++ b/${APPROVED_FIX.file}\n@@\n-${APPROVED_FIX.before}\n+${APPROVED_FIX.after}`,
          explanation:
            "Use the second space-delimited segment as the token while leaving signature verification unchanged.",
        },
      ],
      testsToRun: input.plan.expectedTests,
      createdAt: new Date().toISOString(),
    });
  }

  async explainVerification(input: VerificationInput) {
    return {
      summary: input.verification.passed
        ? "The approved Access Gate patch passed the required test execution."
        : "The required test execution did not verify the contribution.",
      evidence: input.verification.criteria.map(
        (criterion) => `${criterion.passed ? "Passed" : "Failed"}: ${criterion.description}`
      ),
      remainingRisk: input.verification.passed
        ? "Malformed Authorization header cases remain the recommended follow-up."
        : "The patch must not be treated as complete until all criteria pass.",
    };
  }
}
