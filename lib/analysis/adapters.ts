import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { detectDatabases } from "./detectors/databases";
import { detectDocker } from "./detectors/docker";
import { detectExternalServices } from "./detectors/external-services";
import type { DetectorOutput } from "./detectors/ecosystems/types";
import { detectJavaScriptTypeScript } from "./detectors/ecosystems/javascript-typescript";
import { detectGitHubActions } from "./detectors/github-actions";
import { detectMonorepo } from "./detectors/monorepo";
import { detectNextJs } from "./detectors/nextjs";
import { detectObservability } from "./detectors/observability";
import { detectTailwindShadcn } from "./detectors/tailwind-shadcn";
import { detectTerraform } from "./detectors/terraform";
import type { RepositoryDetector } from "./detectors";
import type {
  Component,
  ContributionCandidate,
  DetectorResult,
  Evidence,
  Relationship,
  RepositoryInventory,
  SystemFlow,
  WorkspacePackage,
} from "./types";

const MAX_FILE_BYTES = 1024 * 1024;
const MAX_TOTAL_BYTES = 64 * 1024 * 1024;
const MAX_FINDINGS_PER_TYPE = 50;

export interface AnalysisTextFile {
  path: string;
  content: string;
}

interface ProvisionalEvidence {
  path: string;
  line?: number;
  endLine?: number;
  snippet?: string;
}

interface ProvisionalFinding {
  type?: string;
  kind?: string;
  label?: string;
  name?: string;
  description?: string;
  confidence?: "high" | "medium";
  evidence: ProvisionalEvidence[];
  details?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

interface ReadInventoryResult {
  files: AnalysisTextFile[];
  limitedPaths: Set<string>;
  warnings: string[];
}

function stableId(prefix: string, ...parts: unknown[]): string {
  const digest = createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 20);
  return `${prefix}:${digest}`;
}

function stringDetail(details: Record<string, unknown>, key: string): string | undefined {
  return typeof details[key] === "string" ? details[key] : undefined;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function relevantTo(detectorId: string, file: string): boolean {
  const source = /\.[cm]?[jt]sx?$/i.test(file);
  const packageFile = /(?:^|\/)package\.json$/.test(file);
  switch (detectorId) {
    case "javascript-typescript": return source || /(?:^|\/)(?:tsconfig|jsconfig)[^/]*\.json$/.test(file);
    case "monorepo": return packageFile || /(?:^|\/)(?:pnpm-workspace\.yaml|turbo\.json|nx\.json|project\.json|(?:package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?))$/.test(file);
    case "nextjs": return packageFile || source || /(?:^|\/)next\.config\./.test(file);
    case "databases": return packageFile || source || /\.(?:sql|prisma)$/.test(file);
    case "tailwind-shadcn": return packageFile || /\.(?:css|pcss|postcss)$/.test(file) || /(?:^|\/)(?:components\.json|tailwind\.config\.)/.test(file);
    case "docker": return /(?:^|\/)(?:Dockerfile(?:\..+)?|(?:docker-)?compose(?:\.[\w.-]+)?\.ya?ml)$/i.test(file);
    case "terraform": return /\.tf$/i.test(file);
    case "github-actions": return /^\.github\/workflows\/[^/]+\.ya?ml$/i.test(file);
    case "observability": return source;
    case "external-services": return source || packageFile || /\.tf$/i.test(file) || /^\.github\/workflows\//.test(file);
    default: return false;
  }
}

export async function readInventoryTextFiles(
  root: string,
  inventory: RepositoryInventory,
): Promise<ReadInventoryResult> {
  const resolvedRoot = path.resolve(root);
  const files: AnalysisTextFile[] = [];
  const limitedPaths = new Set<string>();
  const warnings: string[] = [];
  let totalBytes = 0;

  for (const entry of inventory.files) {
    if (!entry.safeToRead) continue;
    if (entry.sizeBytes > MAX_FILE_BYTES || totalBytes + entry.sizeBytes > MAX_TOTAL_BYTES) {
      limitedPaths.add(entry.path);
      continue;
    }
    const resolved = path.resolve(resolvedRoot, entry.path);
    if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
      limitedPaths.add(entry.path);
      warnings.push(`Skipped repository path outside analysis root: ${entry.path}`);
      continue;
    }
    try {
      const bytes = await fs.readFile(resolved);
      if (bytes.includes(0)) {
        limitedPaths.add(entry.path);
        warnings.push(`Skipped non-text inventory file: ${entry.path}`);
        continue;
      }
      files.push({ path: entry.path, content: bytes.toString("utf8") });
      totalBytes += bytes.byteLength;
    } catch (error) {
      limitedPaths.add(entry.path);
      warnings.push(`Could not read ${entry.path}: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }
  if (limitedPaths.size > 0) warnings.push(`${limitedPaths.size} inventory file(s) were excluded by text or size limits.`);
  return { files, limitedPaths, warnings };
}

export async function createAnalysisSandbox(files: AnalysisTextFile[]): Promise<{
  root: string;
  cleanup: () => Promise<void>;
}> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "repoquest-analysis-"));
  for (const file of files) {
    const destination = path.join(root, file.path);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, file.content, "utf8");
  }
  return { root, cleanup: () => fs.rm(root, { recursive: true, force: true }) };
}

function findingType(finding: ProvisionalFinding): string {
  return finding.type ?? finding.kind ?? "finding";
}

function findingLabel(finding: ProvisionalFinding): string {
  return finding.label ?? finding.name ?? findingType(finding);
}

function findingDetails(finding: ProvisionalFinding): Record<string, unknown> {
  return finding.details ?? finding.metadata ?? {};
}

function normalizeResult(input: {
  detectorId: string;
  findings: ProvisionalFinding[];
  files: AnalysisTextFile[];
  limitedPaths: Set<string>;
}): DetectorResult {
  const warnings: string[] = [];
  const counts = new Map<string, number>();
  const selected = input.findings.filter((finding) => {
    const type = findingType(finding);
    const count = counts.get(type) ?? 0;
    counts.set(type, count + 1);
    return count < MAX_FINDINGS_PER_TYPE;
  });
  const omitted = input.findings.length - selected.length;
  if (omitted > 0) warnings.push(`${input.detectorId} summarized ${omitted} repetitive finding(s).`);

  const evidence: Evidence[] = [];
  const evidenceByFinding = new Map<ProvisionalFinding, string[]>();
  for (const finding of selected) {
    const claim = finding.description ?? findingLabel(finding);
    const ids: string[] = [];
    for (const item of finding.evidence) {
      const start = Math.max(1, item.line ?? 1);
      const end = Math.max(start, item.endLine ?? start);
      const id = stableId("evidence", input.detectorId, item.path, start, end, claim);
      if (!evidence.some((record) => record.id === id)) {
        evidence.push({
          id,
          path: item.path,
          lines: { start, end },
          claim,
          excerpt: item.snippet || undefined,
          detectorId: input.detectorId,
        });
      }
      ids.push(id);
    }
    evidenceByFinding.set(finding, unique(ids));
  }

  const components: Component[] = [];
  const relationships: Relationship[] = [];
  const workspacePackages: WorkspacePackage[] = [];
  const flows: SystemFlow[] = [];
  const contributionCandidates: ContributionCandidate[] = [];
  const addComponent = (key: string, component: Omit<Component, "id" | "detectorIds" | "metadata"> & { metadata?: Record<string, unknown> }) => {
    const id = stableId("component", input.detectorId, key);
    components.push({ ...component, id, detectorIds: [input.detectorId], metadata: component.metadata ?? {} });
    return id;
  };
  const idsFor = (findings: ProvisionalFinding[]) => unique(findings.flatMap((finding) => evidenceByFinding.get(finding) ?? []));
  const pathsFor = (findings: ProvisionalFinding[]) => unique(findings.flatMap((finding) => finding.evidence.map(({ path: file }) => file)));
  const metadataFor = (findings: ProvisionalFinding[]) => ({
    findingCounts: Object.fromEntries(counts),
    samples: findings.slice(0, 20).map(findingLabel),
    findings: findings.map((finding) => ({
      type: findingType(finding),
      label: findingLabel(finding),
      description: finding.description,
      confidence: finding.confidence ?? "high",
      details: findingDetails(finding),
      evidenceIds: evidenceByFinding.get(finding) ?? [],
      paths: unique(finding.evidence.map(({ path: file }) => file)),
    })),
  });

  if (input.detectorId === "monorepo") {
    const packageFindings = selected.filter((finding) => findingType(finding) === "workspace-package");
    const packageByName = new Map<string, { packageId: string; componentId: string }>();
    for (const finding of packageFindings) {
      const details = findingDetails(finding);
      const name = stringDetail(details, "name") ?? findingLabel(finding).replace(/ \(.+\)$/, "");
      const directory = stringDetail(details, "directory") ?? ".";
      const manifestPath = directory === "." ? "package.json" : `${directory}/package.json`;
      const classification = stringDetail(details, "classification") ?? "package";
      const componentId = addComponent(`package:${directory}`, {
        name,
        kind: classification === "application" ? "application" : classification === "service" ? "service" : classification === "tooling" ? "tooling" : "package",
        description: `${name} workspace package.`,
        paths: [manifestPath],
        evidenceIds: evidenceByFinding.get(finding) ?? [],
        confidence: "high",
        metadata: details,
      });
      const packageId = stableId("package", directory, name);
      packageByName.set(name, { packageId, componentId });
      workspacePackages.push({
        id: packageId,
        name,
        rootPath: directory === "." ? "" : directory,
        manifestPath,
        ecosystem: "node",
        componentId,
        internalDependencyIds: [],
        evidenceIds: evidenceByFinding.get(finding) ?? [],
      });
      relationships.push({
        id: stableId("relationship", input.detectorId, "component:repository", componentId, "contains"),
        sourceComponentId: "component:repository",
        targetComponentId: componentId,
        kind: "contains",
        description: `Repository contains the ${name} workspace package.`,
        evidenceIds: evidenceByFinding.get(finding) ?? [],
      });
    }
    for (const finding of selected.filter((item) => findingType(item) === "internal-dependency")) {
      const details = findingDetails(finding);
      const from = packageByName.get(stringDetail(details, "from") ?? "");
      const to = packageByName.get(stringDetail(details, "to") ?? "");
      if (!from || !to) continue;
      const sourcePackage = workspacePackages.find(({ id }) => id === from.packageId);
      if (sourcePackage) sourcePackage.internalDependencyIds.push(to.packageId);
      relationships.push({
        id: stableId("relationship", input.detectorId, from.componentId, to.componentId, "depends-on"),
        sourceComponentId: from.componentId,
        targetComponentId: to.componentId,
        kind: "depends-on",
        description: finding.description ?? findingLabel(finding),
        evidenceIds: evidenceByFinding.get(finding) ?? [],
      });
    }
    const tooling = selected.filter((finding) => ["package-manager", "task-runner", "workspace-task", "workspace-pattern"].includes(findingType(finding)));
    if (tooling.length) addComponent("workspace-tooling", {
      name: "Workspace tooling",
      kind: "tooling",
      description: "Package management and workspace task orchestration.",
      paths: pathsFor(tooling), evidenceIds: idsFor(tooling), confidence: "high",
      metadata: { findingCounts: Object.fromEntries(counts) },
    });
  } else if (input.detectorId === "github-actions") {
    const jobs = selected.filter((finding) => findingType(finding) === "job");
    const jobComponents = new Map<string, string>();
    for (const finding of jobs) {
      const workflow = finding.evidence[0]?.path ?? "workflow";
      const job = findingLabel(finding);
      jobComponents.set(`${workflow}:${job}`, addComponent(`job:${workflow}:${job}`, {
        name: job,
        kind: "tooling",
        description: finding.description ?? `GitHub Actions job ${job}.`,
        paths: [workflow], evidenceIds: evidenceByFinding.get(finding) ?? [], confidence: "high",
        metadata: { workflow, job },
      }));
    }
    for (const finding of selected.filter((item) => findingType(item) === "job-dependency")) {
      const details = findingDetails(finding);
      const workflow = finding.evidence[0]?.path ?? "workflow";
      const source = jobComponents.get(`${workflow}:${stringDetail(details, "job")}`);
      const target = jobComponents.get(`${workflow}:${stringDetail(details, "needs")}`);
      if (source && target) relationships.push({
        id: stableId("relationship", input.detectorId, workflow, source, target),
        sourceComponentId: source, targetComponentId: target, kind: "depends-on",
        description: finding.description ?? findingLabel(finding), evidenceIds: evidenceByFinding.get(finding) ?? [],
      });
    }
    for (const workflow of unique(jobs.map((finding) => finding.evidence[0]?.path).filter((value): value is string => Boolean(value)))) {
      const workflowJobs = jobs.filter((finding) => finding.evidence[0]?.path === workflow);
      const componentIds = workflowJobs.map((finding) => jobComponents.get(`${workflow}:${findingLabel(finding)}`)).filter((value): value is string => Boolean(value));
      flows.push({
        id: stableId("flow", input.detectorId, workflow), name: workflow,
        description: `Automation flow declared by ${workflow}.`, componentIds,
        steps: workflowJobs.map((finding, index) => ({ order: index + 1, componentId: componentIds[index], description: finding.description ?? findingLabel(finding), evidenceIds: evidenceByFinding.get(finding) ?? [] })),
        evidenceIds: idsFor(workflowJobs),
      });
    }
  } else if (input.detectorId === "docker") {
    const services = selected.filter((finding) => findingType(finding) === "service");
    const serviceIds = new Map<string, string>();
    for (const finding of services) serviceIds.set(`${finding.evidence[0]?.path}:${findingLabel(finding)}`, addComponent(`service:${findingLabel(finding)}:${finding.evidence[0]?.path}`, {
      name: findingLabel(finding), kind: "service", description: finding.description ?? findingLabel(finding),
      paths: pathsFor([finding]), evidenceIds: idsFor([finding]), confidence: "high", metadata: findingDetails(finding),
    }));
    for (const finding of selected.filter((item) => findingType(item) === "dependency")) {
      const composePath = finding.evidence[0]?.path;
      const source = serviceIds.get(`${composePath}:${stringDetail(findingDetails(finding), "service")}`);
      const target = serviceIds.get(`${composePath}:${findingLabel(finding)}`);
      if (source && target) relationships.push({ id: stableId("relationship", input.detectorId, source, target), sourceComponentId: source, targetComponentId: target, kind: "depends-on", description: finding.description ?? findingLabel(finding), evidenceIds: idsFor([finding]) });
    }
    const infrastructure = selected.filter((finding) => findingType(finding) !== "service" && findingType(finding) !== "dependency");
    if (infrastructure.length) addComponent("docker-infrastructure", { name: "Container infrastructure", kind: "infrastructure", description: "Docker images, build stages, ports, and health checks.", paths: pathsFor(infrastructure), evidenceIds: idsFor(infrastructure), confidence: "high", metadata: { findingCounts: Object.fromEntries(counts) } });
    const healthyServices = new Set(selected.filter((finding) => findingType(finding) === "health-check").map((finding) => stringDetail(findingDetails(finding), "service")).filter(Boolean));
    for (const finding of services.filter((service) => !healthyServices.has(findingLabel(service)))) {
      const componentId = serviceIds.get(`${finding.evidence[0]?.path}:${findingLabel(finding)}`);
      if (!componentId) continue;
      contributionCandidates.push({ id: stableId("candidate", input.detectorId, "health-check", componentId), title: `Add a health check for ${findingLabel(finding)}`, description: `The Compose service ${findingLabel(finding)} is declared without a detected health check.`, kind: "maintenance", difficulty: "starter", paths: pathsFor([finding]), componentIds: [componentId], rationale: "A service declaration provides direct scope for adding an operational health check.", evidenceIds: idsFor([finding]) });
    }
  } else {
    const configurations: Record<string, { name: string; kind: Component["kind"]; description: string }> = {
      "javascript-typescript": { name: "JavaScript/TypeScript codebase", kind: "application", description: "Source modules, imports, aliases, and project references." },
      nextjs: { name: "Next.js application", kind: "application", description: "Next.js routes and server/client execution boundaries." },
      databases: { name: "Data layer", kind: "database", description: "Database packages, schemas, migrations, and data definitions." },
      "tailwind-shadcn": { name: "UI system", kind: "library", description: "Tailwind CSS and shadcn component infrastructure." },
      terraform: { name: "Terraform infrastructure", kind: "infrastructure", description: "Terraform providers, modules, resources, and state configuration." },
      observability: { name: "Observability", kind: "tooling", description: "Logging, metrics, tracing, error reporting, and health instrumentation." },
    };
    const config = configurations[input.detectorId];
    if (config && selected.length) addComponent("aggregate", { ...config, paths: pathsFor(selected), evidenceIds: idsFor(selected), confidence: selected.some((finding) => finding.confidence === "high" || finding.confidence === undefined) ? "high" : "medium", metadata: metadataFor(selected) });
    if (input.detectorId === "external-services") {
      for (const name of unique(selected.map(findingLabel))) {
        const serviceFindings = selected.filter((finding) => findingLabel(finding) === name);
        const componentId = addComponent(`service:${name}`, { name, kind: "service", description: `Externally managed ${name} service.`, paths: pathsFor(serviceFindings), evidenceIds: idsFor(serviceFindings), confidence: serviceFindings.some((finding) => finding.confidence === "high") ? "high" : "medium", metadata: { signals: serviceFindings.map((finding) => findingDetails(finding)) } });
        relationships.push({ id: stableId("relationship", input.detectorId, "component:repository", componentId), sourceComponentId: "component:repository", targetComponentId: componentId, kind: "calls", description: `Repository code integrates with ${name}.`, evidenceIds: idsFor(serviceFindings) });
      }
    }
  }

  const relevantFiles = input.files.filter((file) => relevantTo(input.detectorId, file.path));
  const limited = [...input.limitedPaths].some((file) => relevantTo(input.detectorId, file));
  const status = limited
    ? "analysis-limited" as const
    : input.findings.length > 0
      ? input.findings.every((finding) => finding.confidence === "medium") ? "uncertain" as const : "found" as const
      : relevantFiles.length > 0 ? "not-detected" as const : "unsupported" as const;
  const categoryEvidenceIds = evidence.slice(0, 25).map(({ id }) => id);
  return {
    detectorId: input.detectorId,
    components, evidence, relationships, flows, workspacePackages, contributionCandidates,
    categoryAnalyses: [{ id: stableId("category", input.detectorId), category: input.detectorId, detectorId: input.detectorId, status, summary: limited ? `${input.detectorId} detection was limited by excluded files.` : input.findings.length ? `${input.findings.length} finding(s) detected.` : relevantFiles.length ? "Applicable files were inventoried, but no signal was detected." : "No applicable files were present.", evidenceIds: categoryEvidenceIds }],
    coverage: [{ id: stableId("coverage", input.detectorId), subjectType: "repository", subjectId: "repository", status: limited ? "partial" : "complete", detectorIds: [input.detectorId], notes: omitted ? [`${omitted} repetitive finding(s) were summarized.`] : [] }],
    warnings,
  };
}

function provisional(output: DetectorOutput): ProvisionalFinding[] {
  return output.findings as ProvisionalFinding[];
}

export function createDetectorAdapters(input: {
  sandboxRoot: string;
  files: AnalysisTextFile[];
  limitedPaths: Set<string>;
  readWarnings: string[];
}): RepositoryDetector[] {
  const normalize = (detectorId: string, findings: ProvisionalFinding[]) => normalizeResult({ detectorId, findings, files: input.files, limitedPaths: input.limitedPaths });
  const ecosystem = (id: string, detect: (root: string) => Promise<DetectorOutput>): RepositoryDetector => ({ id, async detect() { return normalize(id, provisional(await detect(input.sandboxRoot))); } });
  const memory = (id: string, detect: (files: AnalysisTextFile[]) => ProvisionalFinding[]): RepositoryDetector => ({ id, detect() { return normalize(id, detect(input.files)); } });
  return [
    {
      id: "repository-structure",
      detect: () => ({
        detectorId: "repository-structure",
        components: [{ id: "component:repository", name: "Repository", kind: "application", description: "Repository-wide application and source boundary.", paths: [], evidenceIds: [], detectorIds: ["repository-structure"], confidence: "high", metadata: {} }],
        evidence: [],
        relationships: [],
        coverage: [{ id: stableId("coverage", "repository-structure"), subjectType: "repository", subjectId: "repository", status: input.limitedPaths.size ? "partial" : "complete", detectorIds: ["repository-structure"], notes: [] }],
        flows: [],
        workspacePackages: [],
        contributionCandidates: [],
        categoryAnalyses: [],
        warnings: input.readWarnings,
      }),
    },
    ecosystem("javascript-typescript", detectJavaScriptTypeScript),
    ecosystem("monorepo", detectMonorepo),
    ecosystem("nextjs", detectNextJs),
    ecosystem("databases", detectDatabases),
    ecosystem("tailwind-shadcn", detectTailwindShadcn),
    memory("docker", (files) => detectDocker(files)),
    memory("terraform", (files) => detectTerraform(files)),
    memory("github-actions", (files) => detectGitHubActions(files)),
    memory("observability", (files) => detectObservability(files)),
    memory("external-services", (files) => detectExternalServices(files)),
  ];
}
