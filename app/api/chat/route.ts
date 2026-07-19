import { NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { getSession } from "@/lib/campaign/session-store";
import { aiAvailable } from "@/lib/agent/client";
import { readRepoFile } from "@/lib/repository/paths";

export const dynamic = "force-dynamic";

const MODEL = process.env.OPENAI_MODEL ?? "gpt-4.1";
const MAX_CHAT_SOURCE_FILES = 18;
const MAX_CHAT_SOURCE_CHARS = 3_200;

const BodySchema = z.object({
  campaignId: z.string(),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(4000),
      })
    )
    .min(1)
    .max(30),
});

export async function POST(request: Request) {
  try {
    const body = BodySchema.parse(await request.json());
    const session = getSession(body.campaignId);
    if (!session) {
      return NextResponse.json({ error: "Unknown campaign id." }, { status: 404 });
    }
    if (!aiAvailable()) {
      return NextResponse.json({
        reply:
          "Codex chat needs an OpenAI API key. Set OPENAI_API_KEY in .env.local to enable questions.",
      });
    }

    const { campaign } = session;
    const root = session.workspaceRoot;
    if (!root) {
      return NextResponse.json({ error: "No workspace available for this session." }, { status: 400 });
    }

    const docsContext = campaign.knowledgeArchive
      .slice(0, 5)
      .map((doc) => {
        try {
          return `--- ${doc.path} ---\n${readRepoFile(root, doc.path).slice(0, 5000)}`;
        } catch {
          return `--- ${doc.path} --- (summary only) ${doc.summary}`;
        }
      })
      .join("\n\n");

    const mapContext = campaign.nodes
      .map(
        (n) =>
          `${n.gameLabel} (${n.label}): ${n.description} Files: ${n.sourceFiles.join(", ")}`
      )
      .join("\n");

    const sourcePaths = [
      ...new Set(campaign.nodes.flatMap((node) => node.sourceFiles)),
    ].slice(0, MAX_CHAT_SOURCE_FILES);
    const sourceContext = sourcePaths
      .map((file) => {
        try {
          return `--- ${file} ---\n${readRepoFile(root, file).slice(0, MAX_CHAT_SOURCE_CHARS)}`;
        } catch {
          return `--- ${file} ---\n(unreadable)`;
        }
      })
      .join("\n\n");

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 45_000 });
    const response = await client.chat.completions.create({
      model: MODEL,
      max_tokens: 700,
      messages: [
        {
          role: "system",
          content: `You are Codex, the onboarding guide inside RepoQuest. The engineer is
exploring the repository "${campaign.repositoryName}".

Repository summary: ${campaign.summary}

Architecture map:
${mapContext}

Documentation:
${docsContext}

Source code excerpts:
${sourceContext}

Answer questions about this repository like a senior engineer onboarding a new
teammate. Ground every answer in the source excerpts, map, and documents above.
When relevant, name the exact file to open first and why. Use Markdown with
short sections, bullets, and inline code for file paths/symbols. If the provided
excerpts are insufficient, say what is missing instead of inventing behavior.
Never invent file paths.`,
        },
        ...body.messages,
      ],
    });

    const reply =
      response.choices[0]?.message?.content ?? "I couldn't produce an answer — try rephrasing.";
    return NextResponse.json({ reply });
  } catch (error) {
    console.error("chat failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Chat failed." },
      { status: 500 }
    );
  }
}
