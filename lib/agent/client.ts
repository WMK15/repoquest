import OpenAI from "openai";
import { z } from "zod";
import { RepositoryCampaignSchema, type RepositoryCampaign } from "../campaign/types";
import type { MarkdownDocument } from "../repository/read-markdown";
import { readDemoRepoFile } from "../repository/paths";
import { CAMPAIGN_SYSTEM_PROMPT, INVESTIGATION_SYSTEM_PROMPT } from "./prompts";

const AI_TIMEOUT_MS = 45_000;
const MODEL = process.env.OPENAI_MODEL ?? "gpt-4.1";

export function aiAvailable(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

function client(): OpenAI {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: AI_TIMEOUT_MS });
}

const SOURCE_FILES = [
  "src/client/login.ts",
  "src/routes/auth.ts",
  "src/services/token-service.ts",
  "src/middleware/require-auth.ts",
  "src/database/users.ts",
  "tests/authentication.test.ts",
];

function repositoryEvidence(docs: MarkdownDocument[], testOutput: string): string {
  const docSection = docs
    .map((d) => `--- ${d.path} (priority ${d.priority}) ---\n${d.content}`)
    .join("\n\n");
  const srcSection = SOURCE_FILES.map((p) => {
    try {
      return `--- ${p} ---\n${readDemoRepoFile(p)}`;
    } catch {
      return `--- ${p} --- (unreadable)`;
    }
  }).join("\n\n");
  return `# Documentation\n\n${docSection}\n\n# Source code\n\n${srcSection}\n\n# Failing test output\n\n${testOutput}`;
}

async function structuredCall<T>(
  system: string,
  user: string,
  schema: z.ZodType<T>,
  schemaName: string
): Promise<T> {
  const response = await client().chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: { type: "json_object" },
  });
  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error(`Empty ${schemaName} response from model`);
  return schema.parse(JSON.parse(raw));
}

/**
 * Ask the model to generate a campaign from real repository evidence.
 * Throws on any failure — callers fall back to the deterministic campaign.
 */
export async function generateCampaignWithAI(
  docs: MarkdownDocument[],
  testOutput: string
): Promise<RepositoryCampaign> {
  const evidence = repositoryEvidence(docs, testOutput);
  const schemaHint = JSON.stringify(
    z.toJSONSchema(RepositoryCampaignSchema),
    null,
    0
  );
  const campaign = await structuredCall(
    CAMPAIGN_SYSTEM_PROMPT,
    `JSON schema for your response:\n${schemaHint}\n\nRepository evidence:\n${evidence}`,
    RepositoryCampaignSchema,
    "campaign"
  );
  validateCampaignShape(campaign);
  return campaign;
}

/** The generated campaign must still drive the fixed demo flow. */
function validateCampaignShape(campaign: RepositoryCampaign): void {
  const ids = new Set(campaign.nodes.map((n) => n.id));
  for (const required of [
    "login-interface",
    "authentication-route",
    "token-service",
    "access-gate",
    "user-vault",
  ]) {
    if (!ids.has(required)) throw new Error(`AI campaign missing node ${required}`);
  }
  if (campaign.mission.corruptedNodeId !== "access-gate") {
    throw new Error("AI campaign must mark access-gate as the corrupted region");
  }
}

const EXTERNAL_CAMPAIGN_PROMPT = `You are the repository intelligence engine for RepoQuest, an
AI-powered onboarding environment for software engineers.

You are mapping an unfamiliar repository for a new engineer's first day.
Treat documentation as evidence, not guaranteed truth.

From the supplied file tree and documentation, return:
1. A concise repository summary (what the project does, in plain language).
2. Between four and eight meaningful architecture regions with clear,
   accessible descriptions and short evocative gameLabel names.
3. Directed edges showing how the regions depend on or call each other.
4. The most relevant source files for every region (from the file tree only).
5. Documentation entries linked to the regions they describe.
6. Set every node status to "discovered".
7. Set mission to: id "exploration", title "Reconnaissance", a short narrative
   about exploring this specific repository, an exploration objective,
   empty suspectNodeIds, and empty corruptedNodeId.
8. Any contradictions between documentation and the file layout.

Every region card must be useful for onboarding an engineer. For each node
description, write 2-3 specific sentences covering what code lives there, what
responsibility or boundary it owns, when an engineer would edit it, and the
first file they should open. Ground claims in the file tree or documentation.

For every documentation insight, describe the engineering takeaway: what the
doc tells the engineer to do, avoid, configure, or verify for that region.

Avoid generic region names and descriptions. Bad: "UI components for the app."
Good: "The onboarding shell and map interactions live here; edit this when
changing the campaign flow, node drawer, or evidence panels. Start with
components/repoquest/campaign-shell.tsx because it owns stage transitions and
passes state into the map."

Return only valid structured JSON matching the supplied schema.`;

/**
 * AI architecture map for a cloned external repository. Throws on failure —
 * callers fall back to the heuristic campaign.
 */
export async function generateExternalCampaignWithAI(
  repoName: string,
  fileTree: string[],
  docs: MarkdownDocument[]
): Promise<RepositoryCampaign> {
  const docSection = docs
    .slice(0, 10)
    .map((d) => `--- ${d.path} ---\n${d.content.slice(0, 6000)}`)
    .join("\n\n");
  const schemaHint = JSON.stringify(z.toJSONSchema(RepositoryCampaignSchema), null, 0);
  const campaign = await structuredCall(
    EXTERNAL_CAMPAIGN_PROMPT,
    `JSON schema for your response:\n${schemaHint}\n\nRepository: ${repoName}\n\n# File tree (${fileTree.length} files)\n${fileTree.slice(0, 400).join("\n")}\n\n# Documentation\n${docSection}`,
    RepositoryCampaignSchema,
    "external campaign"
  );
  // Server-controlled invariants regardless of what the model returned.
  campaign.repositoryName = repoName;
  campaign.mission.id = "exploration";
  campaign.mission.suspectNodeIds = [];
  campaign.mission.corruptedNodeId = "";
  campaign.nodes = campaign.nodes.slice(0, 9).map((node, i) => ({
    ...node,
    status: "unknown",
    position: { x: (i % 3) * 300 + 60, y: Math.floor(i / 3) * 190 + 40 },
  }));
  const ids = new Set(campaign.nodes.map((n) => n.id));
  campaign.edges = campaign.edges.filter((e) => ids.has(e.source) && ids.has(e.target));
  return campaign;
}

const InvestigationNarrativeSchema = z.object({
  filesInspected: z.array(z.string()),
  documentationInspected: z.array(z.string()),
  ruledOut: z.array(z.string()),
  rootCause: z.string(),
  smallestSafeCorrection: z.string(),
  remainingRisk: z.string(),
});
export type InvestigationNarrative = z.infer<typeof InvestigationNarrativeSchema>;

/** Grounded investigation narrative; throws on failure. */
export async function investigateWithAI(
  docs: MarkdownDocument[],
  testOutput: string,
  selectedSuspect: string
): Promise<InvestigationNarrative> {
  const evidence = repositoryEvidence(docs, testOutput);
  const schemaHint = JSON.stringify(
    z.toJSONSchema(InvestigationNarrativeSchema),
    null,
    0
  );
  return structuredCall(
    INVESTIGATION_SYSTEM_PROMPT,
    `JSON schema for your response:\n${schemaHint}\n\nSelected suspect region: ${selectedSuspect}\n\nRepository evidence:\n${evidence}`,
    InvestigationNarrativeSchema,
    "investigation"
  );
}
