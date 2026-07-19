import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, saveSession } from "@/lib/campaign/session-store";
import type { FixResult } from "@/lib/campaign/types";
import { missionFromCampaign, resolveContributionService } from "@/lib/repoquest/services/runtime-service";

export const dynamic = "force-dynamic";

const BodySchema = z.object({ campaignId: z.string() });

export async function POST(request: Request) {
  try {
    const body = BodySchema.parse(await request.json());
    const session = getSession(body.campaignId);
    if (!session) {
      return NextResponse.json({ error: "Unknown campaign id." }, { status: 404 });
    }
    if (session.campaign.mission.id === "exploration") {
      return NextResponse.json(
        { error: "Fix deployment is only available for instrumented repositories." },
        { status: 400 }
      );
    }

    if (!session.contributionSessionId) {
      throw new Error("Campaign is missing its shared contribution session.");
    }
    const service = await resolveContributionService(session.contributionSessionId);
    const mission = missionFromCampaign(session.campaign);
    let contribution = await service.getSession(session.contributionSessionId);

    // Compatibility wrapper for the original one-click deploy UI. The shared
    // service remains the only place that generates, approves, applies, and verifies work.
    if (contribution.session.stage === "investigating") {
      contribution = await service.completeChallenge({
        sessionId: contribution.session.id,
        challengeId: "bearer-token-extraction",
        correct: true,
        nodeIds: contribution.session.relevantNodeIds,
      });
    }
    if (!contribution.session.implementationPlan) {
      contribution = await service.generatePlan({
        sessionId: contribution.session.id,
        mission,
        repositorySummary: session.campaign.summary,
      });
    }
    if (contribution.session.stage === "awaiting_plan_approval") {
      contribution = await service.approvePlan({ sessionId: contribution.session.id });
    }
    if (!contribution.session.proposedPatch) {
      contribution = await service.proposePatch({
        sessionId: contribution.session.id,
        mission,
        repositorySummary: session.campaign.summary,
      });
    }
    if (contribution.session.stage === "awaiting_patch_approval") {
      contribution = await service.approveAndApplyPatch({ sessionId: contribution.session.id });
    }
    if (!contribution.session.verification) {
      contribution = await service.verifyContribution({ sessionId: contribution.session.id });
    }
    if (contribution.session.stage === "completed" && contribution.session.verification?.passed) {
      contribution = await service.completeMission({ sessionId: contribution.session.id });
    }

    const verification = contribution.session.verification;
    if (!verification) throw new Error("Contribution did not produce verification evidence.");

    const result: FixResult = {
      success: verification.passed,
      changedFile: verification.changedFiles[0] ?? "",
      diff: verification.diff,
      testCommand: verification.command,
      testOutput: verification.output.slice(-4000),
      contributionSummary: verification.passed
        ? "Verified the approved contribution through the shared evidence ledger."
        : "Contribution verification did not pass.",
    };

    if (verification.passed) {
      session.stage = "complete";
      const gate = session.campaign.nodes.find((n) => n.id === "access-gate");
      if (gate) gate.status = "restored";
    }
    saveSession(session);

    return NextResponse.json({
      ...result,
      testSummary: verification.criteria.map((criterion) => criterion.evidence).join(" "),
      contribution,
    });
  } catch (error) {
    console.error("campaign/fix failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Fix deployment failed." },
      { status: 500 }
    );
  }
}
