import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, saveSession } from "@/lib/campaign/session-store";
import { aiAvailable, investigateWithAI } from "@/lib/agent/client";
import { readKnowledgeArchive } from "@/lib/repository/read-markdown";
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

    if (!aiAvailable()) {
      return NextResponse.json(
        { error: "Investigation requires an OpenAI API key." },
        { status: 400 }
      );
    }

    if (!session.workspaceRoot) {
      return NextResponse.json({ error: "No workspace for this campaign." }, { status: 400 });
    }
    const docs = await readKnowledgeArchive(session.workspaceRoot);

    const narrative = await investigateWithAI(
      docs,
      "",
      body.suspectNodeId ?? session.campaign.mission.corruptedNodeId
    );

    const investigation = {
      events: [
        {
          type: "investigation_complete" as const,
          rootCause: narrative.rootCause,
          proposedFix: narrative.smallestSafeCorrection,
        },
      ],
      rootCause: narrative.rootCause,
      proposedFix: narrative.smallestSafeCorrection,
      diff: { before: "", after: "", file: "", line: 0 },
      testCommand: "",
      aiGenerated: true,
    };

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
