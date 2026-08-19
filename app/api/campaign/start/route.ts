import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzeRepository } from "@/lib/analysis/analyze-repository";
import { buildAnalysisCampaign } from "@/lib/campaign/analysis-campaign";
import { saveSession } from "@/lib/campaign/session-store";
import {
  RepositoryCampaignSchema,
  type CampaignSession,
} from "@/lib/campaign/types";
import { runMappingPipeline } from "@/lib/agent/subagents";
import { readKnowledgeArchive } from "@/lib/repository/read-markdown";
import { scanRepo } from "@/lib/repository/scan-files";
import { cloneGitHubRepo, openLocalRepo } from "@/lib/repository/workspace";
import { createRepoQuestRuntime } from "@/lib/repoquest/adapters/create-runtime";
import { registerRuntime } from "@/lib/repoquest/adapters/runtime-registry";
import { DEFAULT_ENGINEER_ID } from "@/lib/repoquest/services/runtime-service";

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
          ? await openLocalRepo(repoUrl.replace(/^~/, process.env.HOME ?? "~"))
          : await cloneGitHubRepo(repoUrl);

        const [scan, docs] = await Promise.all([
          scanRepo(workspace.root),
          readKnowledgeArchive(workspace.root),
        ]);

        send({
          type: "event",
          agent: "system",
          message: `Repository scanned — ${scan.totalFiles} files and ${docs.length} readable documents`,
        });
        send({
          type: "event",
          agent: "cartographer",
          message: "Repository analysis started — running architecture, data, operations, and workspace detectors",
        });
        const analysis = await analyzeRepository(workspace.root, scan);
        send({
          type: "event",
          agent: "cartographer",
          message: `Detectors complete — ${analysis.detectorIds.length} detectors produced ${analysis.evidence.length} evidence claims`,
          detail: `${analysis.components.length} components · ${analysis.relationships.length} relationships · ${analysis.flows.length} flows`,
        });
        if (analysis.warnings.length > 0) {
          send({
            type: "event",
            agent: "system",
            message: `Analysis completed with ${analysis.warnings.length} coverage warning${analysis.warnings.length === 1 ? "" : "s"}`,
            detail: analysis.warnings.slice(0, 3).join(" · "),
          });
        }

        const { campaign, aiGenerated } = forceDeterministic
          ? {
              campaign: buildAnalysisCampaign(workspace.repoName, analysis, docs),
              aiGenerated: false,
            }
          : await runMappingPipeline(
              workspace.repoName,
              workspace.root,
              scan,
              docs,
              (event) => send({ type: "event", ...event }),
              analysis
            );

        const validatedCampaign = RepositoryCampaignSchema.parse(campaign);

        const repositoryId = `workspace:${workspace.identity}`;
        createRepoQuestRuntime({
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
        const session: CampaignSession = {
          id: crypto.randomUUID(),
          campaign: validatedCampaign,
          stage: "mapped",
          aiGenerated,
          startedAt: Date.now(),
          workspaceRoot: workspace.root,
          runtimeMode: "live",
          repositoryId,
        };
        saveSession(session);

        send({
          type: "complete",
          campaignId: session.id,
          campaign: validatedCampaign,
          aiGenerated,
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
