import { NextResponse } from "next/server";
import { z } from "zod";
import { buildDeterministicInvestigation } from "@/lib/campaign/deterministic-campaign";
import { getSession, saveSession } from "@/lib/campaign/session-store";
import { aiAvailable, investigateWithAI } from "@/lib/agent/client";
import { readKnowledgeArchive } from "@/lib/repository/read-markdown";
import { runDemoRepoTests } from "@/lib/repository/run-tests";
import { resolveContributionService } from "@/lib/repoquest/services/runtime-service";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  campaignId: z.string(),
  suspectNodeId: z.string().optional(),
  deterministic: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    const body = BodySchema.parse(await request.json());
    const session = getSession(body.campaignId);
    if (!session) {
      return NextResponse.json({ error: "Unknown campaign id." }, { status: 404 });
    }
    if (session.campaign.mission.id === "exploration") {
      return NextResponse.json(
        { error: "Missions are only available for instrumented repositories." },
        { status: 400 }
      );
    }

    // Deterministic events drive the animation; AI enriches the conclusion.
    const investigation = buildDeterministicInvestigation();

    if (!body.deterministic && aiAvailable()) {
      try {
        const [docs, testRun] = await Promise.all([
          readKnowledgeArchive(),
          runDemoRepoTests(),
        ]);
        const narrative = await investigateWithAI(
          docs,
          testRun.output,
          body.suspectNodeId ?? "access-gate"
        );
        investigation.rootCause = narrative.rootCause;
        investigation.proposedFix = narrative.smallestSafeCorrection;
        investigation.aiGenerated = true;
        const complete = investigation.events.find(
          (e) => e.type === "investigation_complete"
        );
        if (complete && complete.type === "investigation_complete") {
          complete.rootCause = narrative.rootCause;
          complete.proposedFix = narrative.smallestSafeCorrection;
        }
      } catch (error) {
        console.warn("AI investigation failed; using deterministic result:", error);
      }
    }

    session.stage = "investigating";
    session.selectedSuspectNodeId = body.suspectNodeId;
    session.investigation = investigation;
    saveSession(session);

    let contribution = null;
    if (session.contributionSessionId) {
      const service = await resolveContributionService(session.contributionSessionId);
      const current = await service.getSession(session.contributionSessionId);
      for (const nodeId of current.session.relevantNodeIds) {
        await service.exploreNode({ sessionId: current.session.id, nodeId });
      }
      contribution = await service.traceFlow({
        sessionId: current.session.id,
        flowId: "authentication-request",
        nodeIds: current.session.relevantNodeIds,
      });
    }

    return NextResponse.json({ investigation, contribution });
  } catch (error) {
    console.error("campaign/investigate failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Investigation failed." },
      { status: 500 }
    );
  }
}
