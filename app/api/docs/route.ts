import { NextResponse } from "next/server";
import { getSession } from "@/lib/campaign/session-store";
import {
  DEMO_REPO_ROOT,
  readRepoFile,
  resolveInsideRoot,
} from "@/lib/repository/paths";

export const dynamic = "force-dynamic";

/** Serve a single Markdown document from the campaign's repository. */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const path = url.searchParams.get("path") ?? "";
    const campaignId = url.searchParams.get("campaignId");
    if (!/\.(md|mdx)$/i.test(path)) {
      return NextResponse.json({ error: "Only Markdown files." }, { status: 400 });
    }
    // The root is always server-chosen: the session's cloned workspace
    // (if any) or the demo repository — never a caller-supplied path.
    const session = campaignId ? getSession(campaignId) : undefined;
    const root = session?.workspaceRoot ?? DEMO_REPO_ROOT;
    resolveInsideRoot(root, path);
    return NextResponse.json({ path, content: readRepoFile(root, path) });
  } catch {
    return NextResponse.json({ error: "Document unavailable." }, { status: 404 });
  }
}
