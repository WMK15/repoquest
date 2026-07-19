import matter from "gray-matter";
import path from "node:path";
import { DEMO_REPO_ROOT, readRepoFile } from "./paths";
import { scanRepo } from "./scan-files";

const MAX_DOC_CHARS = 12_000;
const MAX_TOTAL_CHARS = 60_000;

export interface MarkdownDocument {
  path: string;
  title: string;
  frontmatter: Record<string, unknown>;
  headings: string[];
  content: string;
  priority: number;
  kind:
    | "overview"
    | "architecture"
    | "contribution"
    | "agent-instructions"
    | "decision"
    | "runbook"
    | "other";
}

function priorityFor(relPath: string): number {
  const base = path.basename(relPath).toUpperCase();
  const lower = relPath.toLowerCase();
  if (base === "AGENTS.MD") return 100;
  if (base === "README.MD" && !relPath.includes("/")) return 95;
  if (base === "ARCHITECTURE.MD") return 90;
  if (base === "CONTRIBUTING.MD") return 85;
  if (/adr|decision/.test(lower)) return 80;
  if (base === "SECURITY.MD" || base === "DEVELOPMENT.MD") return 75;
  if (lower.startsWith("docs/")) return 70;
  if (base === "README.MD") return 65;
  return 50;
}

function kindFor(relPath: string): MarkdownDocument["kind"] {
  const base = path.basename(relPath).toUpperCase();
  const lower = relPath.toLowerCase();
  if (base === "AGENTS.MD") return "agent-instructions";
  if (base === "README.MD") return "overview";
  if (base === "ARCHITECTURE.MD") return "architecture";
  if (base === "CONTRIBUTING.MD") return "contribution";
  if (/adr|decision/.test(lower)) return "decision";
  if (/runbook|incident/.test(lower)) return "runbook";
  return "other";
}

function extractHeadings(markdown: string): string[] {
  return [...markdown.matchAll(/^#{1,3}\s+(.+)$/gm)].map((m) => m[1].trim());
}

/** Read, prioritise, and truncate every Markdown document in the repo. */
export async function readKnowledgeArchive(
  root: string = DEMO_REPO_ROOT
): Promise<MarkdownDocument[]> {
  const { markdownFiles } = await scanRepo(root);

  const docs: MarkdownDocument[] = [];
  for (const relPath of markdownFiles) {
    try {
      const raw = readRepoFile(root, relPath);
      const parsed = matter(raw);
      const content = parsed.content.slice(0, MAX_DOC_CHARS);
      const headings = extractHeadings(content);
      docs.push({
        path: relPath,
        title:
          (parsed.data.title as string) ?? headings[0] ?? path.basename(relPath),
        frontmatter: parsed.data,
        headings,
        content,
        priority: priorityFor(relPath),
        kind: kindFor(relPath),
      });
    } catch {
      // Unreadable or oversized documents are skipped, not fatal.
    }
  }

  docs.sort((a, b) => b.priority - a.priority);

  // Enforce the combined context budget in priority order.
  let budget = MAX_TOTAL_CHARS;
  return docs.map((doc) => {
    const allowed = Math.max(0, Math.min(doc.content.length, budget));
    budget -= allowed;
    return { ...doc, content: doc.content.slice(0, allowed) };
  });
}
