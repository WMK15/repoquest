import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { DEMO_REPO_ROOT, demoRepoGitDir } from "@/lib/repository/paths";
import { aiAvailable } from "@/lib/agent/client";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: fs.existsSync(path.join(DEMO_REPO_ROOT, "package.json")),
    demoRepo: fs.existsSync(DEMO_REPO_ROOT),
    demoRepoGit: demoRepoGitDir() !== null,
    demoRepoDeps: fs.existsSync(path.join(DEMO_REPO_ROOT, "node_modules")),
    aiConfigured: aiAvailable(),
  });
}
