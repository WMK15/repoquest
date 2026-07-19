import { NextResponse } from "next/server";
import { z } from "zod";
import { getRepoQuestMemoryStore } from "@/lib/repoquest/memory/file-memory-store";
import { DEFAULT_ENGINEER_ID } from "@/lib/repoquest/services/runtime-service";

export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  engineerId: z.string().min(1).default(DEFAULT_ENGINEER_ID),
  repositoryId: z.string().min(1).default("pulseboard"),
});

export async function GET(request: Request) {
  const query = QuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
  const profile = await getRepoQuestMemoryStore().getEngineerProfile(query);
  return NextResponse.json({ profile });
}
