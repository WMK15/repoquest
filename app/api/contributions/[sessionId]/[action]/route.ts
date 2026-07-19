import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveContributionService } from "@/lib/repoquest/services/runtime-service";

export const dynamic = "force-dynamic";

const MissionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  objective: z.string().min(1),
  nodeIds: z.array(z.string().min(1)),
  allowedFiles: z.array(z.string().min(1)),
  relevantDocuments: z.array(z.string().min(1)),
  recommendedGuidanceLevel: z.enum(["guided", "assisted", "independent"]),
  reason: z.string().min(1),
});

const ExploreSchema = z.object({ nodeId: z.string().min(1) });
const EvidenceSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("document"), path: z.string().min(1), nodeIds: z.array(z.string().min(1)) }),
  z.object({ type: z.literal("flow"), flowId: z.string().min(1), nodeIds: z.array(z.string().min(1)) }),
  z.object({ type: z.literal("challenge"), challengeId: z.string().min(1), correct: z.boolean(), nodeIds: z.array(z.string().min(1)) }),
]);
const MissionOperationSchema = z.object({ mission: MissionSchema, repositorySummary: z.string() });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string; action: string }> }
) {
  try {
    const { sessionId, action } = await params;
    const body = await request.json().catch(() => ({}));
    const service = await resolveContributionService(sessionId);
    switch (action) {
      case "explore": {
        const input = ExploreSchema.parse(body);
        return NextResponse.json(await service.exploreNode({ sessionId, ...input }));
      }
      case "evidence": {
        const input = EvidenceSchema.parse(body);
        if (input.type === "document") {
          return NextResponse.json(
            await service.recordDocumentRead({ sessionId, path: input.path, nodeIds: input.nodeIds })
          );
        }
        if (input.type === "flow") {
          return NextResponse.json(
            await service.traceFlow({ sessionId, flowId: input.flowId, nodeIds: input.nodeIds })
          );
        }
        return NextResponse.json(
          await service.completeChallenge({
            sessionId,
            challengeId: input.challengeId,
            correct: input.correct,
            nodeIds: input.nodeIds,
          })
        );
      }
      case "begin-implementation":
        return NextResponse.json(await service.beginImplementation({ sessionId }));
      case "plan": {
        const input = MissionOperationSchema.parse(body);
        return NextResponse.json(await service.generatePlan({ sessionId, ...input }));
      }
      case "approve-plan":
        return NextResponse.json(await service.approvePlan({ sessionId }));
      case "propose-patch": {
        const input = MissionOperationSchema.parse(body);
        return NextResponse.json(await service.proposePatch({ sessionId, ...input }));
      }
      case "apply":
        return NextResponse.json(await service.approveAndApplyPatch({ sessionId }));
      case "verify":
        return NextResponse.json(await service.verifyContribution({ sessionId }));
      case "complete":
        return NextResponse.json(await service.completeMission({ sessionId }));
      default:
        return NextResponse.json({ error: "Unknown contribution action." }, { status: 404 });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Contribution action failed." },
      { status: 400 }
    );
  }
}
