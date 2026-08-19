import type { DetectorResult } from "../types";

export interface TerraformFileInput {
  path: string;
  content: string;
}

export interface TerraformFinding {
  kind: "provider" | "module" | "resource" | "variable" | "output" | "backend" | "reference";
  name: string;
  description: string;
  confidence: "high" | "medium";
  evidence: Array<{ path: string; line: number; snippet: string }>;
  metadata?: Record<string, unknown>;
}

interface HclBlock {
  type: string;
  labels: string[];
  body: string;
  bodyOffset: number;
  line: number;
}

function lineAt(content: string, offset: number) {
  return content.slice(0, offset).split(/\r?\n/).length;
}

function sourceEvidence(file: TerraformFileInput, line: number) {
  return {
    path: file.path,
    line,
    snippet: file.content.split(/\r?\n/)[line - 1]?.trim().slice(0, 240) ?? "",
  };
}

function maskCommentsAndStrings(content: string) {
  let result = "";
  let quote = false;
  let lineComment = false;
  let blockComment = false;
  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    const next = content[i + 1];
    if (lineComment) {
      if (char === "\n") {
        lineComment = false;
        result += "\n";
      } else result += " ";
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        result += "  ";
        blockComment = false;
        i += 1;
      } else result += char === "\n" ? "\n" : " ";
      continue;
    }
    if (!quote && char === "/" && next === "*") {
      result += "  ";
      blockComment = true;
      i += 1;
      continue;
    }
    if (!quote && ((char === "/" && next === "/") || char === "#")) {
      result += char === "#" ? " " : "  ";
      lineComment = true;
      if (char !== "#") i += 1;
      continue;
    }
    if (char === '"' && content[i - 1] !== "\\") quote = !quote;
    result += quote && char !== '"' ? " " : char;
  }
  return result;
}

function parseBlocks(content: string): HclBlock[] {
  const masked = maskCommentsAndStrings(content);
  const header = /\b(provider|module|resource|data|variable|output|terraform)\s*("[^"]+"\s*)?("[^"]+"\s*)?\{/g;
  const blocks: HclBlock[] = [];
  let match: RegExpExecArray | null;
  while ((match = header.exec(masked))) {
    const open = masked.indexOf("{", match.index);
    let depth = 1;
    let end = open + 1;
    while (end < masked.length && depth > 0) {
      if (masked[end] === "{") depth += 1;
      if (masked[end] === "}") depth -= 1;
      end += 1;
    }
    if (depth !== 0) continue;
    const originalHeader = content.slice(match.index, open);
    const labels = [...originalHeader.matchAll(/"([^"]+)"/g)].map((label) => label[1]);
    blocks.push({
      type: match[1],
      labels,
      body: content.slice(open + 1, end - 1),
      bodyOffset: open + 1,
      line: lineAt(content, match.index),
    });
    header.lastIndex = end;
  }
  return blocks;
}

function namedObject(content: string, name: string) {
  const masked = maskCommentsAndStrings(content);
  const header = new RegExp(`\\b${name}\\s*(?:=\\s*)?\\{`).exec(masked);
  if (!header) return undefined;
  const open = masked.indexOf("{", header.index);
  let depth = 1;
  let end = open + 1;
  while (end < masked.length && depth > 0) {
    if (masked[end] === "{") depth += 1;
    if (masked[end] === "}") depth -= 1;
    end += 1;
  }
  if (depth !== 0) return undefined;
  return { body: content.slice(open + 1, end - 1), offset: open + 1 };
}

function providerAssignments(content: string) {
  const masked = maskCommentsAndStrings(content);
  const providers: Array<{ name: string; offset: number; source?: string }> = [];
  let depth = 0;
  let lineOffset = 0;
  for (const line of masked.split(/\r?\n/)) {
    if (depth === 0) {
      const assignment = /^\s*([A-Za-z_][\w-]*)\s*=\s*(?:\{|\S+)/.exec(line);
      if (assignment) {
        const original = content.slice(lineOffset);
        const source = /^\s*[A-Za-z_][\w-]*\s*=\s*"([^"]+)"/.exec(original)?.[1]
          ?? /\bsource\s*=\s*"([^"]+)"/.exec(original)?.[1];
        providers.push({ name: assignment[1], offset: lineOffset + assignment.index, source });
      }
    }
    depth += [...line].filter((char) => char === "{").length;
    depth -= [...line].filter((char) => char === "}").length;
    lineOffset += line.length + 1;
  }
  return providers;
}

function blockFinding(file: TerraformFileInput, block: HclBlock): TerraformFinding | undefined {
  const joined = block.labels.join(".");
  if (block.type === "terraform") return undefined;
  const kind = block.type === "data" ? "resource" : block.type as TerraformFinding["kind"];
  const name = block.type === "data" ? `data.${joined}` : joined;
  return {
    kind,
    name,
    description: block.type === "data"
      ? `Terraform data source ${joined} is read.`
      : `Terraform ${block.type} ${joined} is declared.`,
    confidence: "high",
    evidence: [sourceEvidence(file, block.line)],
    metadata: block.type === "resource" || block.type === "data"
      ? { mode: block.type, resourceType: block.labels[0], localName: block.labels[1] }
      : undefined,
  };
}

export function detectTerraform(files: TerraformFileInput[]): TerraformFinding[] {
  return files.filter((file) => file.path.endsWith(".tf")).flatMap((file) => {
    const findings: TerraformFinding[] = [];
    const blocks = parseBlocks(file.content);
    for (const block of blocks) {
      const finding = blockFinding(file, block);
      if (finding) findings.push(finding);

      if (block.type === "terraform") {
        const backend = block.body.match(/\bbackend\s+"([^"]+)"\s*\{/);
        if (backend) {
          const offset = file.content.indexOf(backend[0], file.content.split(/\r?\n/).slice(0, block.line).join("\n").length);
          const line = offset >= 0 ? lineAt(file.content, offset) : block.line;
          findings.push({
            kind: "backend",
            name: backend[1],
            description: `Terraform state uses the ${backend[1]} backend.`,
            confidence: "high",
            evidence: [sourceEvidence(file, line)],
          });
        }
        const requiredProviders = namedObject(block.body, "required_providers");
        if (requiredProviders) {
          for (const provider of providerAssignments(requiredProviders.body)) {
            findings.push({
              kind: "provider",
              name: provider.name,
              description: `Terraform requires provider ${provider.name}.`,
              confidence: "high",
              evidence: [sourceEvidence(file, lineAt(file.content, block.bodyOffset + requiredProviders.offset + provider.offset))],
              metadata: { source: provider.source },
            });
          }
        }
      }
    }

    const declared = new Set(blocks.flatMap((block) => {
      if (block.type === "resource" && block.labels.length === 2) return [`${block.labels[0]}.${block.labels[1]}`];
      if (["module", "variable", "output", "data"].includes(block.type) && block.labels[0]) {
        return [`${block.type}.${block.labels.join(".")}`];
      }
      return [];
    }));
    const masked = maskCommentsAndStrings(file.content);
    const referencePattern = /\b(module\.[A-Za-z0-9_-]+|var\.[A-Za-z0-9_-]+|data\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|[A-Za-z][A-Za-z0-9_-]*\.[A-Za-z0-9_-]+)(?:\.[A-Za-z0-9_-]+)*/g;
    for (const match of masked.matchAll(referencePattern)) {
      const reference = file.content.slice(match.index, match.index + match[0].length);
      const root = reference.split(".").slice(0, reference.startsWith("data.") ? 3 : 2).join(".");
      if (declared.has(root) && lineAt(file.content, match.index) === blocks.find((block) => block.labels.join(".") === root)?.line) continue;
      findings.push({
        kind: "reference",
        name: reference,
        description: `Terraform expression references ${reference}.`,
        confidence: "medium",
        evidence: [sourceEvidence(file, lineAt(file.content, match.index))],
        metadata: { root },
      });
    }
    return findings;
  });
}

type DetectorContextLike = { files: TerraformFileInput[] };
type TerraformDetectorResult = Pick<DetectorResult, "detectorId"> & { findings: TerraformFinding[] };

export const terraformDetector = {
  id: "terraform",
  name: "Terraform",
  detect(context: DetectorContextLike): TerraformDetectorResult {
    return { detectorId: "terraform", findings: detectTerraform(context.files) };
  },
};
export default terraformDetector;
