import fs from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import { z } from "zod";
import type { RepositoryCampaign } from "../campaign/types";
import { buildHeuristicExternalCampaign } from "../campaign/external-campaign";
import type { MarkdownDocument } from "../repository/read-markdown";
import type { RepoScan } from "../repository/scan-files";
import { aiAvailable } from "./client";

const MODEL = process.env.OPENAI_MODEL ?? "gpt-4.1";
const CALL_TIMEOUT_MS = 60_000;
const MAX_SOURCE_SAMPLES = 24;
const MAX_SOURCE_SAMPLE_CHARS = 2_400;

/** A grounded, user-visible action taken while mapping a repository. */
export interface MappingEvent {
  agent: "system" | "scout" | "cartographer" | "archivist";
  message: string;
  detail?: string;
}

type Emit = (event: MappingEvent) => void;

function client(): OpenAI {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: CALL_TIMEOUT_MS });
}

function prioritizeSourceFiles(files: string[]): string[] {
  const score = (file: string) => {
    let value = 0;
    if (/^(app|pages|src|components|lib|server|api)\//.test(file)) value += 8;
    if (/(route|controller|handler|service|store|model|schema|client|provider|middleware)/i.test(file)) value += 6;
    if (/(index|main|app|layout|page)\.(ts|tsx|js|jsx|mjs|cjs)$/.test(file)) value += 4;
    if (/\.(test|spec)\./.test(file)) value -= 5;
    if (/\.d\.ts$/.test(file)) value -= 8;
    return value;
  };

  return [...files]
    .sort((a, b) => score(b) - score(a) || a.length - b.length || a.localeCompare(b))
    .slice(0, MAX_SOURCE_SAMPLES);
}

async function readSourceSamples(root: string, files: string[]): Promise<string> {
  const samples = await Promise.all(
    files.map(async (file) => {
      try {
        const absolute = path.join(root, file);
        const content = await fs.readFile(absolute, "utf8");
        return `--- ${file} ---\n${content.slice(0, MAX_SOURCE_SAMPLE_CHARS)}`;
      } catch {
        return `--- ${file} ---\n(unreadable)`;
      }
    })
  );

  return samples.join("\n\n");
}

async function structuredCall<T>(
  system: string,
  user: string,
  schema: z.ZodType<T>
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
  if (!raw) throw new Error("Empty model response");
  return schema.parse(JSON.parse(raw));
}

const ScoutReportSchema = z.object({
  repositorySummary: z.string(),
  documentFindings: z.array(
    z.object({
      path: z.string(),
      kind: z.enum([
        "overview",
        "architecture",
        "contribution",
        "agent-instructions",
        "decision",
        "runbook",
        "other",
      ]),
      summary: z.string(),
      keyFacts: z.array(z.string()),
    })
  ),
  candidateRegions: z.array(z.string()),
});

const CartographerReportSchema = z.object({
  nodes: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      gameLabel: z.string(),
      description: z.string(),
      sourceFiles: z.array(z.string()),
    })
  ),
  edges: z.array(
    z.object({
      id: z.string(),
      source: z.string(),
      target: z.string(),
      description: z.string(),
    })
  ),
});

const ArchivistReportSchema = z.object({
  links: z.array(
    z.object({
      documentPath: z.string(),
      nodeId: z.string(),
      insight: z.string(),
    })
  ),
  contradictions: z.array(
    z.object({
      documentedClaim: z.string(),
      codeEvidence: z.string(),
      documentationPath: z.string(),
      sourcePath: z.string(),
    })
  ),
});

/**
 * Map an external repository with three specialist agents, emitting a
 * grounded event for every real step. Falls back to the heuristic
 * campaign when no API key is configured or a call fails.
 */
export async function runMappingPipeline(
  repoName: string,
  root: string,
  scan: RepoScan,
  docs: MarkdownDocument[],
  emit: Emit
): Promise<{ campaign: RepositoryCampaign; aiGenerated: boolean }> {
  const heuristic = buildHeuristicExternalCampaign(repoName, scan, docs);

  emit({
    agent: "system",
    message: `Repository mounted — ${scan.sourceFiles.length} source files, ${scan.markdownFiles.length} documents`,
  });

  if (!aiAvailable()) {
    emit({ agent: "system", message: "Codex unavailable — building verified structural map" });
    return { campaign: heuristic, aiGenerated: false };
  }

  try {
    /* -------- Scout: reads the documentation -------- */
    emit({ agent: "scout", message: "Scout deployed — reading the Knowledge Archive" });
    const scoutDocs = docs.slice(0, 10);
    for (const doc of scoutDocs) {
      emit({ agent: "scout", message: `Scout reading ${doc.path}`, detail: doc.title });
    }
    const scout = await structuredCall(
      `You are the Scout, the documentation specialist of RepoQuest's onboarding crew.
Read the repository documents and report what a new engineer must know.
Classify each document, extract key facts, and propose candidate architecture
regions. Ground everything in the supplied text. Return only valid JSON
matching the schema.`,
      `JSON schema:\n${JSON.stringify(z.toJSONSchema(ScoutReportSchema))}\n\nRepository: ${repoName}\n\n${scoutDocs
        .map((d) => `--- ${d.path} ---\n${d.content.slice(0, 6000)}`)
        .join("\n\n")}`,
      ScoutReportSchema
    );
    emit({
      agent: "scout",
      message: `Scout report filed — ${scout.documentFindings.length} documents catalogued, ${scout.candidateRegions.length} candidate regions`,
    });

    /* -------- Cartographer: reads the file tree and representative source -------- */
    emit({ agent: "cartographer", message: "Cartographer deployed — reading source structure" });
    const tree = [...scan.sourceFiles, ...scan.markdownFiles].slice(0, 500);
    const sampledSourceFiles = prioritizeSourceFiles(scan.sourceFiles);
    for (const file of sampledSourceFiles.slice(0, 10)) {
      emit({ agent: "cartographer", message: `Cartographer reading ${file}` });
    }
    const sourceSamples = await readSourceSamples(root, sampledSourceFiles);
    const cartographer = await structuredCall(
      `You are the Cartographer of RepoQuest's onboarding crew. Draw an
architecture map that helps a software engineer decide where to work.

Return between four and eight meaningful regions with short evocative
gameLabel names, source files chosen only from the supplied file tree, and
directed edges showing real dependencies or call flow.

For every node description, write 2-3 specific sentences that answer:
- What code lives here?
- What boundary or responsibility does it own?
- When would an engineer edit this region?
- What is the first file to open and why?

Ground descriptions in the source samples, file tree, and documentation
summary. Avoid generic filler like "handles logic", "manages data", or
"contains components" unless followed by concrete files and responsibilities.
Use kebab-case node ids. Return only valid JSON matching the schema.`,
      `JSON schema:\n${JSON.stringify(z.toJSONSchema(CartographerReportSchema))}\n\nRepository: ${repoName}\nScout's summary: ${scout.repositorySummary}\nCandidate regions: ${scout.candidateRegions.join(", ")}\n\nFile tree (${tree.length} entries):\n${tree.join("\n")}\n\nSource samples:\n${sourceSamples}`,
      CartographerReportSchema
    );
    emit({
      agent: "cartographer",
      message: `Map drafted — ${cartographer.nodes.length} regions, ${cartographer.edges.length} connections`,
    });

    /* -------- Archivist: links documents to regions -------- */
    emit({ agent: "archivist", message: "Archivist deployed — linking evidence to the map" });
    const archivist = await structuredCall(
      `You are the Archivist of RepoQuest's onboarding crew. Link each
document to the map regions it helps an engineer understand.

Each insight must explain the engineering takeaway: what the document tells
someone to edit, run, configure, avoid, or verify for that region. Do not say
only that a document "describes" or "mentions" a region. Note contradictions
between documentation and implementation evidence when present. Only use the
supplied node ids and document paths. Return only valid JSON matching the
schema.`,
      `JSON schema:\n${JSON.stringify(z.toJSONSchema(ArchivistReportSchema))}\n\nRegions:\n${cartographer.nodes
        .map((n) => `${n.id}: ${n.description}`)
        .join("\n")}\n\nDocuments:\n${scout.documentFindings
        .map((d) => `${d.path}: ${d.summary}`)
        .join("\n")}`,
      ArchivistReportSchema
    );
    emit({
      agent: "archivist",
      message: `Archive linked — ${archivist.links.length} evidence links${archivist.contradictions.length ? `, ${archivist.contradictions.length} contradictions flagged` : ""}`,
    });

    /* -------- Assemble the campaign (server-controlled invariants) -------- */
    const nodeIds = new Set(cartographer.nodes.map((n) => n.id));
    const campaign: RepositoryCampaign = {
      repositoryName: repoName,
      summary: scout.repositorySummary,
      nodes: cartographer.nodes.slice(0, 9).map((node, i) => ({
        ...node,
        status: "unknown",
        position: { x: (i % 3) * 300 + 60, y: Math.floor(i / 3) * 190 + 40 },
        documentation: archivist.links
          .filter((l) => l.nodeId === node.id)
          .slice(0, 4)
          .map((l) => ({ path: l.documentPath, insight: l.insight })),
      })),
      edges: cartographer.edges.filter(
        (e) => nodeIds.has(e.source) && nodeIds.has(e.target)
      ),
      knowledgeArchive: scout.documentFindings.map((d) => ({
        path: d.path,
        title: d.path,
        kind: d.kind,
        summary: d.summary,
        headings: d.keyFacts.slice(0, 6),
        relatedNodeIds: archivist.links
          .filter((l) => l.documentPath === d.path)
          .map((l) => l.nodeId),
      })),
      contradictions: archivist.contradictions,
      mission: heuristic.mission,
    };
    return { campaign, aiGenerated: true };
  } catch (error) {
    console.warn("Mapping pipeline failed; using heuristic campaign:", error);
    emit({
      agent: "system",
      message: "Codex analysis unavailable — loading verified structural map",
    });
    return { campaign: heuristic, aiGenerated: false };
  }
}
