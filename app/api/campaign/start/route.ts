import { NextResponse } from "next/server";
import { z } from "zod";
import { buildHeuristicExternalCampaign } from "@/lib/campaign/external-campaign";
import { saveSession } from "@/lib/campaign/session-store";
import type { CampaignSession, RepositoryCampaign } from "@/lib/campaign/types";
import { aiAvailable } from "@/lib/agent/client";
import { runMappingPipeline } from "@/lib/agent/subagents";
import { readKnowledgeArchive } from "@/lib/repository/read-markdown";
import { scanRepo } from "@/lib/repository/scan-files";
import { cloneGitHubRepo, openLocalRepo } from "@/lib/repository/workspace";
import { createRepoQuestRuntime } from "@/lib/repoquest/adapters/create-runtime";
import { registerRuntime } from "@/lib/repoquest/adapters/runtime-registry";
import { DefaultContributionService } from "@/lib/repoquest/services/contribution-service";
import {
  DEFAULT_ENGINEER_ID,
  missionFromCampaign,
} from "@/lib/repoquest/services/runtime-service";

export const dynamic = "force-dynamic";

const BodySchema = z
  .object({
    deterministic: z.boolean().optional(),
    repoUrl: z.string().max(300).optional(),
  })
  .optional();

export async function POST(request: Request) {
  try {
    const body = BodySchema.parse(await request.json().catch(() => ({})));

    if (!body?.repoUrl?.trim()) {
      return NextResponse.json(
        { error: "A repository URL or local path is required." },
        { status: 400 }
      );
    }
    return await startExternalCampaign(body.repoUrl.trim(), body.deterministic ?? false);
  } catch (error) {
    console.error("campaign/start failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start campaign." },
      { status: 500 }
    );
  }
}

async function startExternalCampaign(repoUrl: string, forceDeterministic: boolean) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        const isLocal = /^[/~.]/.test(repoUrl);
        send({
          type: "event",
          agent: "system",
          message: isLocal ? `Mounting ${repoUrl}…` : `Cloning ${repoUrl}…`,
        });
        const workspace = isLocal
          ? openLocalRepo(repoUrl.replace(/^~/, process.env.HOME ?? "~"))
          : await cloneGitHubRepo(repoUrl);

        const [scan, docs] = await Promise.all([
          scanRepo(workspace.root),
          readKnowledgeArchive(workspace.root),
        ]);

        const { campaign, aiGenerated } = forceDeterministic
          ? {
              campaign: buildHeuristicExternalCampaign(workspace.repoName, scan, docs),
              aiGenerated: false,
            }
          : await runMappingPipeline(workspace.repoName, workspace.root, scan, docs, (event) =>
              send({ type: "event", ...event })
            );

        const repositoryId = `workspace:${workspace.owner}/${workspace.repoName}`;
        const runtime = createRepoQuestRuntime({
          mode: "live",
          engineerId: DEFAULT_ENGINEER_ID,
          repositoryId,
          repositoryRoot: workspace.root,
          repositoryName: workspace.repoName,
        });
        await registerRuntime({
          repositoryId,
          mode: "live",
          repositoryName: workspace.repoName,
          repositoryRoot: workspace.root,
        });
        const contributionMission = missionFromCampaign(campaign);
        const contribution = await new DefaultContributionService(runtime).startMission({
          mission: contributionMission,
        });
        const session: CampaignSession = {
          id: crypto.randomUUID(),
          campaign,
          stage: "mapped",
          aiGenerated,
          startedAt: Date.now(),
          workspaceRoot: workspace.root,
          contributionSessionId: contribution.session.id,
          runtimeMode: "live",
          repositoryId,
        };
        saveSession(session);

        send({
          type: "complete",
          campaignId: session.id,
          campaign,
          aiGenerated,
          contribution,
          contributionMission,
          sourceFiles: scan.sourceFiles.length,
          markdownFiles: scan.markdownFiles.length,
        });
      } catch (error) {
        send({
          type: "error",
          error: error instanceof Error ? error.message : "Repository mapping failed.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" },
  });
}
