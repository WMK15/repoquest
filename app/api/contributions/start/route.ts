import { NextResponse } from "next/server";
import { z } from "zod";
import { aiAvailable } from "@/lib/agent/client";
import { buildHeuristicExternalCampaign } from "@/lib/campaign/external-campaign";
import { createRepoQuestRuntime } from "@/lib/repoquest/adapters/create-runtime";
import { getRegisteredRuntime } from "@/lib/repoquest/adapters/runtime-registry";
import { DefaultContributionService } from "@/lib/repoquest/services/contribution-service";
import {
  DEFAULT_ENGINEER_ID,
  missionFromCampaign,
} from "@/lib/repoquest/services/runtime-service";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  mode: z.enum(["live"]).default("live"),
  repositoryId: z.string().min(1).optional(),
  engineerId: z.string().min(1).default(DEFAULT_ENGINEER_ID),
});

export async function POST(request: Request) {
  try {
    const body = BodySchema.parse(await request.json());
    if (!body.repositoryId) throw new Error("A registered live repository is required.");
    const descriptor = await getRegisteredRuntime(body.repositoryId);
    if (!descriptor?.repositoryRoot) throw new Error("Live repository workspace is unavailable.");
    const runtime = createRepoQuestRuntime({
      mode: "live",
      engineerId: body.engineerId,
      repositoryId: descriptor.repositoryId,
      repositoryRoot: descriptor.repositoryRoot,
      repositoryName: descriptor.repositoryName,
    });
    const identity = await runtime.repository.getRepositoryIdentity();
    const [index, documents] = await Promise.all([
      runtime.repository.scanRepository(),
      runtime.repository.readDocuments(),
    ]);
    const campaign = aiAvailable()
      ? await runtime.agent.generateCampaign({ repository: identity, index, documents })
      : buildHeuristicExternalCampaign(identity.name, index, documents);
    const contribution = await new DefaultContributionService(runtime).startMission({
      mission: missionFromCampaign(campaign),
    });
    return NextResponse.json({ campaign, contribution });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to start contribution." },
      { status: 400 }
    );
  }
}
