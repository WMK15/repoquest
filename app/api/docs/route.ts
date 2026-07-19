import { NextResponse } from "next/server";
import { getSession } from "@/lib/campaign/session-store";
import {
  readRepoFile,
  resolveInsideRoot,
} from "@/lib/repository/paths";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const path = url.searchParams.get("path") ?? "";
    const campaignId = url.searchParams.get("campaignId");
    if (!/\.(md|mdx)$/i.test(path)) {
      return NextResponse.json({ error: "Only Markdown files." }, { status: 400 });
    }
    const session = campaignId ? getSession(campaignId) : undefined;
    if (!session?.workspaceRoot) {
      return NextResponse.json({ error: "No workspace available." }, { status: 400 });
    }
    resolveInsideRoot(session.workspaceRoot, path);
    return NextResponse.json({ path, content: readRepoFile(session.workspaceRoot, path) });
  } catch {
    return NextResponse.json({ error: "Document unavailable." }, { status: 404 });
  }
}
