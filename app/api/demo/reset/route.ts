import { NextResponse } from "next/server";
import { createRepoQuestRuntime } from "@/lib/repoquest/adapters/create-runtime";
import { DEFAULT_ENGINEER_ID } from "@/lib/repoquest/services/runtime-service";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const runtime = createRepoQuestRuntime({
      mode: "demo",
      engineerId: DEFAULT_ENGINEER_ID,
      repositoryId: "pulseboard",
    });
    await runtime.execution.resetWorkspace();
    return NextResponse.json({ reset: "demo-repository" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Demo reset failed." },
      { status: 500 }
    );
  }
}
