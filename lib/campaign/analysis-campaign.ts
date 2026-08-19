import path from "node:path";
import type { RepositoryAnalysis } from "../analysis/types";
import type { MarkdownDocument } from "../repository/read-markdown";
import {
  RepositoryCampaignSchema,
  type AnalysisCoverageArea,
  type AnalysisCoverageStatus,
  type RepositoryCampaign,
} from "./types";

const COVERAGE_DETECTORS: Record<AnalysisCoverageArea, string[]> = {
  frontend: ["nextjs", "tailwind-shadcn"],
  backend: ["nextjs"],
  database: ["databases"],
  logging: ["observability"],
  metrics: ["observability"],
  tracing: ["observability"],
  alerts: ["observability"],
  "external-services": ["external-services"],
  infrastructure: ["docker", "terraform"],
  ci: ["github-actions"],
};

const OBSERVABILITY_PATTERN: Partial<Record<AnalysisCoverageArea, RegExp>> = {
  backend: /(?:\bserver boundary\b|\bserver-only\b|\bmiddleware\b|\/api(?:\/|\b)|(?:^|\/)route\.[cm]?[jt]sx?)/i,
  logging: /\b(log|logger|logging|pino|winston)\b/i,
  metrics: /\b(metric|metrics|prometheus|statsd)\b/i,
  tracing: /\b(trace|tracing|span|opentelemetry)\b/i,
  alerts: /\b(alert|alerts|sentry|pager|error report)\b/i,
};

const TECHNOLOGY_NAMES: Record<string, string> = {
  "javascript-typescript": "JavaScript/TypeScript",
  nextjs: "Next.js",
  "tailwind-shadcn": "Tailwind CSS / shadcn",
  databases: "Database",
  docker: "Docker",
  terraform: "Terraform",
  "github-actions": "GitHub Actions",
  observability: "Observability",
  "external-services": "External service",
  monorepo: "Workspace package",
};

const ROOT_COMPONENT_ID = "component:repository";

const ROOT_ENTRY_POINT_PRIORITY = [
  "README.md",
  "AGENTS.md",
  "CONTRIBUTING.md",
  "package.json",
  "pnpm-workspace.yaml",
  "turbo.json",
  "nx.json",
  "docker-compose.yml",
  "docker-compose.yaml",
  "Dockerfile",
] as const;

type AnalysisRelationship = RepositoryAnalysis["relationships"][number];

function gridPosition(index: number) {
  return { x: (index % 3) * 300 + 60, y: Math.floor(index / 3) * 190 + 40 };
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function formatList(values: string[]): string {
  if (values.length <= 1) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
}

function packageFamily(name: string): string {
  if (name.startsWith("@")) return `${name.split("/")[0]}/*`;
  const parts = name.split("-").filter(Boolean);
  if (parts.length >= 3) return `${parts[0]}-${parts[1]}-*`;
  if (parts.length === 2) return `${parts[0]}-*`;
  return name;
}

function topPackageFamilies(packages: RepositoryAnalysis["workspacePackages"]): string[] {
  const counts = new Map<string, number>();
  for (const workspacePackage of packages) {
    const family = packageFamily(workspacePackage.name);
    counts.set(family, (counts.get(family) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 4)
    .map(([family, count]) => `${family} (${count})`);
}

function topWorkspaceAreas(packages: RepositoryAnalysis["workspacePackages"]): string[] {
  const counts = new Map<string, number>();
  for (const workspacePackage of packages) {
    const area = workspacePackage.rootPath.split("/").filter(Boolean)[0];
    if (!area) continue;
    counts.set(area, (counts.get(area) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 4)
    .map(([area, count]) => `${area}/ (${count})`);
}

function isRootContainment(relationship: AnalysisRelationship): boolean {
  return relationship.sourceComponentId === ROOT_COMPONENT_ID && relationship.kind === "contains";
}

function repositoryEntryPoints(inventoryPaths: Set<string>): string[] {
  const preferred = ROOT_ENTRY_POINT_PRIORITY.filter((file) => inventoryPaths.has(file));
  const workflows = [...inventoryPaths]
    .filter((file) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(file))
    .sort()
    .slice(0, 2);
  return unique([...preferred, ...workflows]).slice(0, 8);
}

function repositoryResponsibilities(
  analysis: RepositoryAnalysis,
  components: RepositoryAnalysis["components"],
  relationships: AnalysisRelationship[]
): string[] {
  const responsibilities: string[] = [];
  const packageCount = analysis.workspacePackages.length;
  if (packageCount > 0) {
    const areas = topWorkspaceAreas(analysis.workspacePackages);
    const families = topPackageFamilies(analysis.workspacePackages);
    responsibilities.push(
      areas.length > 0
        ? `Coordinates ${plural(packageCount, "workspace package")} across ${formatList(areas)}.`
        : `Coordinates ${plural(packageCount, "workspace package")}.`
    );
    if (packageCount > 8 && families.length > 0) {
      responsibilities.push(`Largest package families: ${formatList(families)}.`);
    }
  }

  const externalServices = unique(
    relationships
      .filter((relationship) => relationship.sourceComponentId === ROOT_COMPONENT_ID && relationship.kind === "calls")
      .map((relationship) => components.find((component) => component.id === relationship.targetComponentId)?.name)
      .filter((name): name is string => Boolean(name))
  ).slice(0, 5);
  if (externalServices.length > 0) {
    responsibilities.push(`Detected external integrations: ${formatList(externalServices)}.`);
  }

  const technologies = unique(
    analysis.categoryAnalyses
      .filter((category) => category.status === "found")
      .map((category) => TECHNOLOGY_NAMES[category.detectorId])
      .filter((name): name is string => Boolean(name))
  ).slice(0, 5);
  if (technologies.length > 0) {
    responsibilities.push(`Main detected areas: ${formatList(technologies)}.`);
  }

  if (responsibilities.length === 0) {
    responsibilities.push("Repository-wide overview for source, tooling, and documentation boundaries.");
  }
  return responsibilities.slice(0, 4);
}

function repositoryEditGuidance(entryPoints: string[]): string {
  const rootFiles = entryPoints.length > 0 ? ` Root-level starting points: ${formatList(entryPoints.slice(0, 4))}.` : "";
  return `Use this as the repository overview. For code changes, open the specific app, package, infrastructure, or external-service region that owns the files.${rootFiles}`;
}

function repositorySummary(
  repositoryName: string,
  analysis: RepositoryAnalysis,
  nodeCount: number,
  edgeCount: number
): string {
  const parts = [
    `${repositoryName}: ${plural(analysis.inventory.totalFiles, "file")} inventoried by ${plural(analysis.detectorIds.length, "deterministic detector")}.`,
  ];
  if (analysis.workspacePackages.length > 0) {
    parts.push(`${plural(analysis.workspacePackages.length, "workspace package")} mapped into ${plural(nodeCount, "architecture region")}.`);
  } else {
    parts.push(`${plural(nodeCount, "architecture region")} mapped.`);
  }
  if (edgeCount > 0) {
    parts.push(`${plural(edgeCount, "evidence-backed relationship")} shown between actionable regions.`);
  }
  return parts.join(" ");
}

function coverageStatus(statuses: string[]): AnalysisCoverageStatus {
  if (statuses.includes("found")) return "found";
  if (statuses.includes("analysis-limited")) return "analysis-limited";
  if (statuses.includes("uncertain")) return "uncertain";
  if (statuses.includes("not-detected")) return "not-detected";
  return "unsupported";
}

function pathRoot(file: string): string {
  if (!file.includes("/")) return "";
  return path.posix.dirname(file);
}

function pathsOverlap(left: string[], right: string[]): boolean {
  return left.some((leftPath) => {
    const root = pathRoot(leftPath);
    return right.some(
      (rightPath) =>
        rightPath === leftPath ||
        (root !== "" && (rightPath === root || rightPath.startsWith(`${root}/`)))
    );
  });
}

function metadataStringArray(metadata: Record<string, unknown>, key: string): string[] {
  const value = metadata[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function topologyRank(
  component: RepositoryAnalysis["components"][number],
  packageComponentIds: Set<string>
): number {
  if (component.id === "component:repository") return 0;
  if (component.name === "Workspace tooling") return 0;
  if (packageComponentIds.has(component.id)) {
    if (component.kind === "application" || component.kind === "service") return 1;
    return component.detectorIds.includes("databases") ? 3 : 2;
  }
  if (component.kind === "database" || component.detectorIds.includes("databases")) return 3;
  if (
    component.kind === "infrastructure" ||
    component.detectorIds.some((id) => ["docker", "terraform", "external-services"].includes(id))
  ) return 4;
  if (component.detectorIds.includes("github-actions")) return 5;
  return 2;
}

/** Convert validated detector output into the authoritative campaign map. */
export function buildAnalysisCampaign(
  repositoryName: string,
  analysis: RepositoryAnalysis,
  docs: MarkdownDocument[]
): RepositoryCampaign {
  const inventoryPaths = new Set(analysis.inventory.files.map((file) => file.path));
  const evidence = analysis.evidence.filter((item) => inventoryPaths.has(item.path));
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  const packageComponentIds = new Set(
    analysis.workspacePackages
      .map((workspacePackage) => workspacePackage.componentId)
      .filter((id): id is string => Boolean(id))
  );
  const components = [...analysis.components].sort(
    (left, right) =>
      topologyRank(left, packageComponentIds) - topologyRank(right, packageComponentIds) ||
      left.name.localeCompare(right.name) ||
      left.id.localeCompare(right.id)
  );
  const componentIds = new Set(components.map((component) => component.id));
  const componentPaths = new Map<string, string[]>();

  for (const component of components) {
    componentPaths.set(
      component.id,
      unique([
        ...component.paths.filter((file) => inventoryPaths.has(file)),
        ...component.evidenceIds
          .map((id) => evidenceById.get(id)?.path)
          .filter((file): file is string => Boolean(file)),
      ])
    );
  }

  const validDocs = docs.filter((doc) => inventoryPaths.has(doc.path));
  const displayRelationships = analysis.relationships.filter((relationship) => !isRootContainment(relationship));
  const rootEntryPoints = repositoryEntryPoints(inventoryPaths);
  const rootResponsibilities = repositoryResponsibilities(analysis, components, displayRelationships);

  const nodes = components.map((component, index) => {
    const isRepositoryRoot = component.id === ROOT_COMPONENT_ID;
    const sourceFiles = isRepositoryRoot ? rootEntryPoints : componentPaths.get(component.id) ?? [];
    const configuredEntryPoints = metadataStringArray(component.metadata, "sourceEntryPoints")
      .filter((file) => sourceFiles.includes(file));
    const claims = component.evidenceIds
      .map((id) => evidenceById.get(id)?.claim)
      .filter((claim): claim is string => Boolean(claim));
    const relatedDocs = validDocs.filter((doc) => pathsOverlap(sourceFiles, [doc.path]));
    return {
      id: component.id,
      label: component.name,
      gameLabel: component.name,
      description: component.description,
      status: "unknown" as const,
      sourceFiles,
      position: gridPosition(index),
      category: component.kind,
      technologies: unique(
        component.detectorIds.map((id) => TECHNOLOGY_NAMES[id]).filter(Boolean)
      ),
      purpose: component.description,
      confidence: component.confidence,
      responsibilities: isRepositoryRoot ? rootResponsibilities : unique(claims).slice(0, 6),
      entryPoints: unique([...configuredEntryPoints, ...sourceFiles]).slice(0, 8),
      dependencies: undefined,
      editGuidance: isRepositoryRoot
        ? repositoryEditGuidance(rootEntryPoints)
        : sourceFiles[0]
        ? `Start with ${sourceFiles[0]} and verify the linked evidence before editing this component.`
        : "Use the linked relationships and evidence to locate this repository-wide boundary.",
      uncertainties:
        component.confidence === "low" ? ["Detector confidence for this component is low."] : [],
      detectorIds: component.detectorIds,
      evidenceIds: component.evidenceIds.filter((id) => evidenceById.has(id)),
      metadata: component.metadata,
      documentation: relatedDocs.slice(0, 4).map((doc) => ({
        path: doc.path,
        heading: doc.headings[0],
        insight: `Read ${doc.title} for context adjacent to ${component.name}.`,
      })),
    };
  });

  const edges = displayRelationships
    .filter(
      (relationship) =>
        componentIds.has(relationship.sourceComponentId) &&
        componentIds.has(relationship.targetComponentId)
    )
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((relationship) => ({
      id: relationship.id,
      source: relationship.sourceComponentId,
      target: relationship.targetComponentId,
      description: relationship.description,
      kind: relationship.kind,
      evidenceIds: relationship.evidenceIds.filter((id) => evidenceById.has(id)),
    }));

  const analysisCoverage = (Object.keys(COVERAGE_DETECTORS) as AnalysisCoverageArea[]).map(
    (area) => {
      const detectorIds = COVERAGE_DETECTORS[area];
      const categories = analysis.categoryAnalyses.filter((category) =>
        detectorIds.includes(category.detectorId)
      );
      const pattern = OBSERVABILITY_PATTERN[area];
      const categoryEvidence = categories.flatMap((category) => category.evidenceIds);
      const evidenceIds = unique(categoryEvidence).filter((id) => {
        const item = evidenceById.get(id);
         return item && (!pattern || pattern.test(`${item.path} ${item.claim} ${item.excerpt ?? ""}`));
      });
      const statuses = categories.map((category) => category.status);
      const status = pattern && coverageStatus(statuses) === "found" && evidenceIds.length === 0
        ? "not-detected"
        : coverageStatus(statuses);
      const coveredComponents = components
        .filter((component) => component.detectorIds.some((id) => detectorIds.includes(id)))
        .filter(
          (component) =>
            !pattern || component.evidenceIds.some((id) => evidenceIds.includes(id))
        )
        .map((component) => component.id);
      return {
        area,
        status,
         summary: pattern
           ? evidenceIds.length > 0
             ? `${evidenceIds.length} ${area} signal(s) detected from area-specific evidence.`
             : `No ${area}-specific evidence was detected.`
           : categories.map((category) => category.summary).join(" ") ||
             `No ${area} detector is available for this repository.`,
        evidence: evidenceIds,
        componentIds: coveredComponents,
      };
    }
  );

  const flowComponentIds = new Set(analysis.flows.flatMap((flow) => flow.componentIds));
  const flowSections = [...analysis.flows]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((flow) => ({
      id: flow.id,
      title: flow.name,
      objective: flow.description,
      componentIds: flow.componentIds.filter((id) => componentIds.has(id)),
      flowSteps: [...flow.steps]
        .sort((left, right) => left.order - right.order)
        .filter((step) => componentIds.has(step.componentId))
        .map((step) => ({ instruction: step.description, componentId: step.componentId })),
      completionRequirements: ["Review each component in this detected flow."],
      evidenceRequirements: unique(flow.evidenceIds).filter((id) => evidenceById.has(id)),
      topologyRank: Math.min(
        ...flow.componentIds
          .map((id) => components.find((component) => component.id === id))
          .filter((component): component is RepositoryAnalysis["components"][number] => Boolean(component))
          .map((component) => topologyRank(component, packageComponentIds)),
        5
      ),
    }));
  const componentSections = nodes
    .filter((node) => !flowComponentIds.has(node.id))
    .map((node) => {
      const isRepositoryRoot = node.id === ROOT_COMPONENT_ID;
      return {
        id: `walkthrough:${node.id}`,
        title: node.label,
        objective: node.description,
        componentIds: [node.id],
        flowSteps: [{
          instruction: isRepositoryRoot
            ? "Use the repository overview to identify the app, package, infrastructure, or external-service region that owns your change."
            : node.sourceFiles[0]
            ? `Open ${node.sourceFiles[0]} and compare it with the component claims.`
            : `Review the relationships around ${node.label}.`,
          componentId: node.id,
        }],
        completionRequirements: [
          isRepositoryRoot
            ? "Choose the specific detailed region to inspect before editing."
            : "Review the component responsibility and dependencies.",
        ],
        evidenceRequirements: node.evidenceIds ?? [],
        topologyRank: topologyRank(
          components.find((component) => component.id === node.id)!,
          packageComponentIds
        ),
      };
    });
  const guidedWalkthrough = [...flowSections, ...componentSections]
    .sort(
      (left, right) =>
        left.topologyRank - right.topologyRank || left.title.localeCompare(right.title) ||
        left.id.localeCompare(right.id)
    )
    .map((section, order) => ({
      id: section.id,
      order,
      title: section.title,
      objective: section.objective,
      componentIds: section.componentIds,
      flowSteps: section.flowSteps,
      completionRequirements: section.completionRequirements,
      evidenceRequirements: section.evidenceRequirements,
    }));

  const detectedContributionCandidates = analysis.contributionCandidates
    .map((candidate) => ({
      ...candidate,
      paths: unique(candidate.paths.filter((file) => inventoryPaths.has(file))),
      componentIds: unique(candidate.componentIds.filter((id) => componentIds.has(id))),
      evidenceIds: unique(candidate.evidenceIds.filter((id) => evidenceById.has(id))),
    }))
    .filter(
      (candidate) =>
        candidate.paths.length > 0 &&
        candidate.componentIds.length > 0 &&
        candidate.evidenceIds.length > 0
    );
  const rootDocumentation = validDocs.find((doc) =>
    /^(?:readme|architecture|contributing)(?:\.[^/]+)?$/i.test(doc.path)
  );
  const documentationCandidates = rootDocumentation
    ? components
        .filter((component) =>
          ["application", "service", "library", "package"].includes(component.kind)
        )
        .filter((component) => component.id !== "component:repository")
        .filter((component) => component.evidenceIds.some((id) => evidenceById.has(id)))
        .filter((component) => {
          const paths = componentPaths.get(component.id) ?? [];
          return !validDocs.some(
            (doc) => doc.path !== rootDocumentation.path && pathsOverlap(paths, [doc.path])
          );
        })
        .slice(0, 3)
        .map((component) => ({
          id: `candidate:document:${component.id}`,
          title: `Document the ${component.name} boundary`,
          description: `Add a concise explanation of ${component.name}, its responsibility, and its internal dependencies to ${rootDocumentation.path}.`,
          kind: "documentation" as const,
          difficulty: "starter" as const,
          paths: [rootDocumentation.path],
          componentIds: [component.id],
          rationale: `RepoQuest detected ${component.name} from implementation evidence but found no adjacent architecture documentation for the component.`,
          evidenceIds: component.evidenceIds.filter((id) => evidenceById.has(id)).slice(0, 4),
        }))
    : [];
  const contributionCandidates = [
    ...detectedContributionCandidates,
    ...documentationCandidates.filter(
      (candidate) =>
        !detectedContributionCandidates.some(
          (existing) =>
            existing.kind === candidate.kind &&
            existing.componentIds.includes(candidate.componentIds[0])
        )
    ),
  ].slice(0, 5);

  return RepositoryCampaignSchema.parse({
    repositoryName,
    summary: repositorySummary(repositoryName, analysis, nodes.length, edges.length),
    nodes,
    edges,
    evidence,
    knowledgeArchive: validDocs.map((doc) => ({
      path: doc.path,
      title: doc.title,
      kind: doc.kind,
      summary: doc.headings.slice(0, 3).join(" · ") || doc.title,
      headings: doc.headings.slice(0, 8),
      relatedNodeIds: nodes
        .filter((node) => pathsOverlap(node.sourceFiles, [doc.path]))
        .map((node) => node.id),
    })),
    contradictions: [],
    mission: {
      id: "exploration",
      title: "Reconnaissance",
      narrative: `Explore the evidence-backed component map for ${repositoryName}.`,
      objective: "Follow the guided walkthrough, then begin a bounded contribution.",
      suspectNodeIds: [],
      corruptedNodeId: "",
    },
    analysisCoverage,
    guidedWalkthrough,
    contributionCandidates,
  });
}
