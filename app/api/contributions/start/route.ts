import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, saveSession } from "@/lib/campaign/session-store";
import { createRepoQuestRuntime } from "@/lib/repoquest/adapters/create-runtime";
import { getRegisteredRuntime } from "@/lib/repoquest/adapters/runtime-registry";
import { DefaultContributionService } from "@/lib/repoquest/services/contribution-service";
import {
  DEFAULT_ENGINEER_ID,
  missionFromCampaign,
} from "@/lib/repoquest/services/runtime-service";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  campaignId: z.string().trim().min(1),
  candidateId: z.string().trim().min(1).optional(),
});

export async function POST(request: Request) {
  try {
    const body = BodySchema.parse(await request.json());
    const campaignSession = getSession(body.campaignId);
    if (!campaignSession) {
      return NextResponse.json({ error: "Unknown campaign id." }, { status: 404 });
    }
    if (!campaignSession.repositoryId || campaignSession.runtimeMode !== "live") {
      throw new Error("This campaign does not have a registered live repository.");
    }
    if (campaignSession.contributionSessionId) {
      throw new Error("A contribution has already been selected for this campaign.");
    }

    const descriptor = await getRegisteredRuntime(campaignSession.repositoryId);
    if (!descriptor?.repositoryRoot) throw new Error("Live repository workspace is unavailable.");
    const runtime = createRepoQuestRuntime({
      mode: "live",
      engineerId: DEFAULT_ENGINEER_ID,
      repositoryId: descriptor.repositoryId,
      repositoryRoot: descriptor.repositoryRoot,
      repositoryName: descriptor.repositoryName,
    });
    const mission = missionFromCampaign(campaignSession.campaign, body.candidateId);
    const service = new DefaultContributionService(runtime);
    const started = await service.startMission({
      mission,
    });
    const contribution = await service.beginImplementation({ sessionId: started.session.id });
    campaignSession.contributionSessionId = contribution.session.id;
    saveSession(campaignSession);

    return NextResponse.json({ contribution, mission });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to start contribution." },
      { status: 400 }
    );
  }
}
