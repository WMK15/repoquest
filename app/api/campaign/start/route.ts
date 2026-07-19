import { NextResponse } from "next/server";
import { z } from "zod";
import { buildDeterministicCampaign } from "@/lib/campaign/deterministic-campaign";
import { buildHeuristicExternalCampaign } from "@/lib/campaign/external-campaign";
import { saveSession } from "@/lib/campaign/session-store";
import type { CampaignSession, RepositoryCampaign } from "@/lib/campaign/types";
import { aiAvailable, generateCampaignWithAI } from "@/lib/agent/client";
import { runMappingPipeline } from "@/lib/agent/subagents";
import { assertDemoRepoExists } from "@/lib/repository/paths";
import { readKnowledgeArchive } from "@/lib/repository/read-markdown";
import { runDemoRepoTests } from "@/lib/repository/run-tests";
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

    if (body?.repoUrl?.trim()) {
      return await startExternalCampaign(body.repoUrl.trim(), body.deterministic ?? false);
    }
    return await startPulseBoardCampaign(body?.deterministic ?? false);
  } catch (error) {
    console.error("campaign/start failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start campaign." },
      { status: 500 }
    );
  }
}

async function startPulseBoardCampaign(forceDeterministic: boolean) {
  assertDemoRepoExists();

  const [scan, docs, baseline] = await Promise.all([
    scanRepo(),
    readKnowledgeArchive(),
    runDemoRepoTests(),
  ]);

  let campaign: RepositoryCampaign;
  let aiGenerated = false;
  if (!forceDeterministic && aiAvailable()) {
    try {
      campaign = await generateCampaignWithAI(docs, baseline.output);
      // Pin the demo-critical pieces: positions, statuses, labels, and the
      // mission identity stay deterministic; AI enriches descriptions,
      // insights, and the narrative around them.
      const deterministic = buildDeterministicCampaign();
      campaign.nodes = campaign.nodes.map((node) => {
        const fixed = deterministic.nodes.find((n) => n.id === node.id);
        return fixed
          ? {
              ...node,
              label: fixed.label,
              gameLabel: fixed.gameLabel,
              position: fixed.position,
              status: fixed.status,
              sourceFiles: fixed.sourceFiles,
            }
          : node;
      });
      campaign.edges = deterministic.edges;
      campaign.mission = {
        ...campaign.mission,
        id: deterministic.mission.id,
        title: deterministic.mission.title,
        suspectNodeIds: deterministic.mission.suspectNodeIds,
        corruptedNodeId: deterministic.mission.corruptedNodeId,
      };
      aiGenerated = true;
    } catch (error) {
      console.warn("AI campaign generation failed; using fallback:", error);
      campaign = buildDeterministicCampaign();
    }
  } else {
    campaign = buildDeterministicCampaign();
  }

  const runtime = createRepoQuestRuntime({
    mode: "demo",
    engineerId: DEFAULT_ENGINEER_ID,
    repositoryId: "pulseboard",
  });
  await registerRuntime({
    repositoryId: "pulseboard",
    mode: "demo",
    repositoryName: campaign.repositoryName,
  });
  const contributionMission = missionFromCampaign(campaign);
  const contribution = await new DefaultContributionService(runtime).startMission({
    mission: contributionMission,
  });

  return respond(campaign, aiGenerated, {
    sourceFiles: scan.sourceFiles.length,
    markdownFiles: scan.markdownFiles.length,
    baselineTest: {
      command: baseline.command,
      success: baseline.success,
      summary: baseline.summary,
    },
  }, contribution.session.id, contributionMission, contribution);
}

/**
 * External repositories stream NDJSON: one grounded mapping event per line
 * while the sub-agent pipeline runs, then a final `complete` line carrying
 * the campaign. The boot screen renders the events live.
 */
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
        // A leading / or ~ (or ./) means a repository on this machine;
        // anything else is a GitHub URL / owner-repo shorthand.
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

function respond(
  campaign: RepositoryCampaign,
  aiGenerated: boolean,
  extra: Record<string, unknown>,
  contributionSessionId?: string,
  contributionMission?: ReturnType<typeof missionFromCampaign>,
  contribution?: unknown,
  workspaceRoot?: string
) {
  const session: CampaignSession = {
    id: crypto.randomUUID(),
    campaign,
    stage: "mapped",
    aiGenerated,
    startedAt: Date.now(),
    workspaceRoot,
    contributionSessionId,
    runtimeMode: "demo",
    repositoryId: "pulseboard",
  };
  saveSession(session);

  return NextResponse.json({
    campaignId: session.id,
    campaign,
    aiGenerated,
    contribution,
    contributionMission,
    ...extra,
  });
}
