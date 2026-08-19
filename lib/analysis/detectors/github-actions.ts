import type { DetectorResult } from "../types";

export interface ActionsFileInput {
  path: string;
  content: string;
}

export interface ActionsFinding {
  kind: "trigger" | "job" | "job-dependency" | "matrix" | "workflow-call" | "action" | "category";
  name: string;
  description: string;
  confidence: "high" | "medium";
  evidence: Array<{ path: string; line: number; snippet: string }>;
  metadata?: Record<string, unknown>;
}

function indent(raw: string) {
  return raw.match(/^\s*/)?.[0].replace(/\t/g, "  ").length ?? 0;
}

function unquote(value: string) {
  return value.trim().replace(/^['"]|['"]$/g, "").replace(/\s+#.*$/, "");
}

function evidence(file: ActionsFileInput, line: number) {
  return { path: file.path, line, snippet: file.content.split(/\r?\n/)[line - 1]?.trim().slice(0, 240) ?? "" };
}

function listValues(value: string) {
  const inline = value.match(/^\[([^\]]*)\]/)?.[1];
  return inline ? inline.split(",").map(unquote).filter(Boolean) : [unquote(value)].filter(Boolean);
}

function categoryFor(text: string): "build" | "test" | "deploy" | undefined {
  if (/\b(deploy|release|publish|pages|production|staging|terraform apply|kubectl|helm)\b/i.test(text)) return "deploy";
  if (/\b(test|pytest|jest|vitest|mocha|cypress|playwright|coverage|lint|check|typecheck)\b/i.test(text)) return "test";
  if (/\b(build|compile|bundle|docker build|package)\b/i.test(text)) return "build";
  return undefined;
}

export function detectGitHubActions(files: ActionsFileInput[]): ActionsFinding[] {
  return files.filter((file) => /^\.github\/workflows\/[^/]+\.ya?ml$/i.test(file.path.replace(/^\.\//, ""))).flatMap((file) => {
    const lines = file.content.split(/\r?\n/);
    const findings: ActionsFinding[] = [];
    let topSection: "on" | "jobs" | undefined;
    let topIndent = -1;
    let currentJob: string | undefined;
    let jobIndent = -1;
    let jobEntryIndent = -1;
    let matrixIndent = -1;
    let inMatrix = false;
    let needsIndent = -1;
    let inNeeds = false;
    const jobCategories = new Map<string, Set<string>>();

    lines.forEach((raw, index) => {
      const trimmed = raw.trim();
      const spacing = indent(raw);
      if (!trimmed || trimmed.startsWith("#")) return;
      const line = index + 1;

      const inlineOn = trimmed.match(/^on:\s*(.+)$/);
       if (inlineOn && topSection === undefined) {
        for (const trigger of listValues(inlineOn[1])) {
          findings.push({ kind: "trigger", name: trigger, description: `Workflow runs on ${trigger}.`, confidence: "high", evidence: [evidence(file, line)] });
        }
        topSection = undefined;
        return;
      }
       if (/^on:\s*$/.test(trimmed)) {
        topSection = "on";
        topIndent = spacing;
        return;
      }
       if (/^jobs:\s*$/.test(trimmed)) {
        topSection = "jobs";
         topIndent = spacing;
         currentJob = undefined;
         jobEntryIndent = -1;
        return;
      }

      if (topSection === "on") {
        if (spacing <= topIndent) topSection = undefined;
        else {
          const trigger = trimmed.match(/^([\w-]+):/)?.[1];
          if (trigger) findings.push({ kind: "trigger", name: trigger, description: `Workflow runs on ${trigger}.`, confidence: "high", evidence: [evidence(file, line)] });
          return;
        }
      }
      if (topSection !== "jobs") return;
      if (spacing <= topIndent) {
        topSection = undefined;
        return;
      }

       const job = trimmed.match(/^([A-Za-z0-9_-]+):\s*$/)?.[1];
       if (job && spacing > topIndent && (jobEntryIndent < 0 || spacing === jobEntryIndent)) {
         if (jobEntryIndent < 0) jobEntryIndent = spacing;
        currentJob = job;
        jobIndent = spacing;
        inMatrix = false;
        inNeeds = false;
        findings.push({ kind: "job", name: job, description: `GitHub Actions job ${job} is declared.`, confidence: "high", evidence: [evidence(file, line)] });
        jobCategories.set(job, new Set());
        return;
      }
      if (!currentJob || spacing <= jobIndent) return;

      const needsDeclaration = trimmed.match(/^needs:\s*(.*)$/);
      const needs = needsDeclaration?.[1];
      if (needs) {
        for (const dependency of listValues(needs)) {
          findings.push({
            kind: "job-dependency",
            name: `${currentJob} -> ${dependency}`,
            description: `Job ${currentJob} waits for ${dependency}.`,
            confidence: "high",
            evidence: [evidence(file, line)],
            metadata: { job: currentJob, needs: dependency },
          });
        }
      }
      if (needsDeclaration && !needs) {
        inNeeds = true;
        needsIndent = spacing;
        return;
      }
      if (inNeeds && spacing <= needsIndent) inNeeds = false;
      if (inNeeds) {
        const dependency = trimmed.match(/^-\s*([A-Za-z0-9_-]+)\s*$/)?.[1];
        if (dependency) {
          findings.push({
            kind: "job-dependency",
            name: `${currentJob} -> ${dependency}`,
            description: `Job ${currentJob} waits for ${dependency}.`,
            confidence: "high",
            evidence: [evidence(file, line)],
            metadata: { job: currentJob, needs: dependency },
          });
          return;
        }
      }

      if (/^matrix:\s*$/.test(trimmed)) {
        inMatrix = true;
        matrixIndent = spacing;
        return;
      }
      if (inMatrix && spacing <= matrixIndent) inMatrix = false;
      if (inMatrix) {
        const dimension = trimmed.match(/^([A-Za-z0-9_-]+):\s*(.+)$/);
        if (dimension && !["include", "exclude"].includes(dimension[1])) {
          findings.push({
            kind: "matrix",
            name: `${currentJob}.${dimension[1]}`,
            description: `Job ${currentJob} varies across matrix dimension ${dimension[1]}.`,
            confidence: "high",
            evidence: [evidence(file, line)],
            metadata: { job: currentJob, dimension: dimension[1], values: listValues(dimension[2]) },
          });
        }
      }

       const uses = trimmed.match(/^-?\s*uses:\s*(\S+)/)?.[1];
       if (uses) {
         const reusable = uses.startsWith("./.github/workflows/") || /\/\.github\/workflows\//.test(uses);
         const remoteAction = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*@[^\s]+$/.test(uses);
         if (!reusable && !remoteAction) return;
         findings.push({
           kind: reusable ? "workflow-call" : "action",
          name: uses,
          description: reusable ? `Job ${currentJob} calls reusable workflow ${uses}.` : `Workflow uses action ${uses}.`,
          confidence: "high",
          evidence: [evidence(file, line)],
          metadata: { job: currentJob },
        });
      }

      const category = categoryFor(trimmed);
      if (category) jobCategories.get(currentJob)?.add(category);
    });

    for (const [job, categories] of jobCategories) {
      for (const category of categories) {
        const jobFinding = findings.find((finding) => finding.kind === "job" && finding.name === job);
        findings.push({
          kind: "category",
          name: category,
          description: `Job ${job} performs ${category} work.`,
          confidence: "medium",
          evidence: jobFinding?.evidence ?? [evidence(file, 1)],
          metadata: { job, category },
        });
      }
    }
    return findings;
  });
}

type DetectorContextLike = { files: ActionsFileInput[] };
type ActionsDetectorResult = Pick<DetectorResult, "detectorId"> & { findings: ActionsFinding[] };

export const githubActionsDetector = {
  id: "github-actions",
  name: "GitHub Actions",
  detect(context: DetectorContextLike): ActionsDetectorResult {
    return { detectorId: "github-actions", findings: detectGitHubActions(context.files) };
  },
};
export default githubActionsDetector;
