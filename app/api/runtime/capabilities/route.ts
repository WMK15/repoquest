import { NextResponse } from "next/server";
import { z } from "zod";
import { createRepoQuestRuntime } from "@/lib/repoquest/adapters/create-runtime";
import { getRegisteredRuntime } from "@/lib/repoquest/adapters/runtime-registry";
import { DEFAULT_ENGINEER_ID } from "@/lib/repoquest/services/runtime-service";

export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  mode: z.enum(["live"]).default("live"),
  repositoryId: z.string().min(1).optional(),
});

export async function GET(request: Request) {
  try {
    const query = QuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    if (!query.repositoryId) throw new Error("repositoryId is required.");
    const descriptor = await getRegisteredRuntime(query.repositoryId);
    if (!descriptor?.repositoryRoot) throw new Error("Live runtime is unavailable.");
    const runtime = createRepoQuestRuntime({
      mode: "live",
      engineerId: DEFAULT_ENGINEER_ID,
      repositoryId: descriptor.repositoryId,
      repositoryRoot: descriptor.repositoryRoot,
      repositoryName: descriptor.repositoryName,
    });
    return NextResponse.json({ mode: runtime.mode, capabilities: runtime.capabilities, features: runtime.features });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load runtime capabilities." },
      { status: 400 }
    );
  }
}
