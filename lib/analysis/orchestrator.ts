import { DetectorResultSchema, RepositoryAnalysisSchema } from "./contracts";
import type { RepositoryDetector } from "./detectors";
import type {
  Component,
  DetectorResult,
  Evidence,
  RepositoryAnalysis,
  RepositoryInventory,
  WorkspacePackage,
} from "./types";

const PACKAGE_SCOPED_DETECTORS = new Set([
  "javascript-typescript",
  "nextjs",
  "databases",
  "tailwind-shadcn",
  "observability",
]);

const DETECTOR_CAPABILITIES: Record<string, string> = {
  "javascript-typescript": "JavaScript/TypeScript modules",
  nextjs: "Next.js routes and execution boundaries",
  databases: "database schemas and access",
  "tailwind-shadcn": "Tailwind CSS and shadcn UI",
  observability: "observability instrumentation",
};

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const unique = new Map<string, T>();
  for (const item of items) {
    const existing = unique.get(item.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(item)) {
      throw new Error(`Conflicting analysis records share ID: ${item.id}`);
    }
    unique.set(item.id, item);
  }
  return [...unique.values()];
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function pathBelongsToPackage(file: string, rootPath: string): boolean {
  return rootPath === "" || file === rootPath || file.startsWith(`${rootPath}/`);
}

function nearestPackage(
  file: string,
  workspacePackages: WorkspacePackage[]
): WorkspacePackage | undefined {
  return workspacePackages
    .filter((workspacePackage) => pathBelongsToPackage(file, workspacePackage.rootPath))
    .sort((left, right) => right.rootPath.length - left.rootPath.length)[0];
}

function entryPointScore(file: string): number {
  if (/(?:^|\/)(?:page|route|layout)\.[cm]?[jt]sx?$/.test(file)) return 0;
  if (/(?:^|\/)(?:index|main|server|app)\.[cm]?[jt]sx?$/.test(file)) return 1;
  if (/\.[cm]?[jt]sx?$/.test(file)) return 2;
  if (/(?:^|\/)package\.json$/.test(file)) return 3;
  if (/\.(?:sql|prisma)$/.test(file)) return 4;
  return 5;
}

function composeWorkspacePackages(
  components: Component[],
  evidence: Evidence[],
  workspacePackages: WorkspacePackage[]
): Component[] {
  const packageComponents = new Map(
    workspacePackages
      .filter((workspacePackage) => workspacePackage.componentId)
      .map((workspacePackage) => [workspacePackage.componentId as string, workspacePackage])
  );
  if (packageComponents.size === 0) return components;

  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  const composed = new Map(
    components.map((component) => [
      component.id,
      {
        ...component,
        paths: [...component.paths],
        evidenceIds: [...component.evidenceIds],
        detectorIds: [...component.detectorIds],
        metadata: { ...component.metadata },
      },
    ])
  );
  const absorbedComponentIds = new Set<string>();

  for (const component of components) {
    const detectorId = component.detectorIds.length === 1 ? component.detectorIds[0] : undefined;
    if (!detectorId || !PACKAGE_SCOPED_DETECTORS.has(detectorId)) continue;

    const evidenceByPackage = new Map<string, string[]>();
    for (const evidenceId of component.evidenceIds) {
      const item = evidenceById.get(evidenceId);
      const workspacePackage = item && nearestPackage(item.path, workspacePackages);
      if (!workspacePackage?.componentId) continue;
      const packageEvidence = evidenceByPackage.get(workspacePackage.componentId) ?? [];
      packageEvidence.push(evidenceId);
      evidenceByPackage.set(workspacePackage.componentId, packageEvidence);
    }

    const assignedEvidence = new Set([...evidenceByPackage.values()].flat());
    for (const [componentId, evidenceIds] of evidenceByPackage) {
      const packageComponent = composed.get(componentId);
      const workspacePackage = packageComponents.get(componentId);
      if (!packageComponent || !workspacePackage) continue;

      const assignedPaths = unique(
        evidenceIds
          .map((id) => evidenceById.get(id)?.path)
          .filter((file): file is string => Boolean(file))
      );
      const rawFindings = Array.isArray(component.metadata.findings)
        ? component.metadata.findings
        : [];
      const findings = rawFindings.filter((finding) => {
        if (!finding || typeof finding !== "object") return false;
        const ids = (finding as { evidenceIds?: unknown }).evidenceIds;
        return Array.isArray(ids) && ids.some((id) => typeof id === "string" && evidenceIds.includes(id));
      });
      const analysisByDetector =
        packageComponent.metadata.analysisByDetector &&
        typeof packageComponent.metadata.analysisByDetector === "object" &&
        !Array.isArray(packageComponent.metadata.analysisByDetector)
          ? { ...packageComponent.metadata.analysisByDetector as Record<string, unknown> }
          : {};
      analysisByDetector[detectorId] = {
        description: component.description,
        confidence: component.confidence,
        evidenceIds,
        paths: assignedPaths,
        findings,
      };
      packageComponent.paths = unique([...packageComponent.paths, ...assignedPaths]);
      packageComponent.evidenceIds = unique([...packageComponent.evidenceIds, ...evidenceIds]);
      packageComponent.detectorIds = unique([...packageComponent.detectorIds, detectorId]);
      packageComponent.metadata = { ...packageComponent.metadata, analysisByDetector };
    }

    const unassignedEvidenceIds = component.evidenceIds.filter((id) => !assignedEvidence.has(id));
    const unassignedPaths = component.paths.filter(
      (file) => !nearestPackage(file, workspacePackages)?.componentId
    );
    if (unassignedEvidenceIds.length === 0 && unassignedPaths.length === 0) {
      absorbedComponentIds.add(component.id);
    } else {
      const unassigned = composed.get(component.id);
      if (unassigned) {
        unassigned.evidenceIds = unassignedEvidenceIds;
        unassigned.paths = unique([
          ...unassignedPaths,
          ...unassignedEvidenceIds
            .map((id) => evidenceById.get(id)?.path)
            .filter((file): file is string => Boolean(file)),
        ]);
      }
    }
  }

  for (const workspacePackage of workspacePackages) {
    if (!workspacePackage.componentId) continue;
    const component = composed.get(workspacePackage.componentId);
    if (!component) continue;
    const capabilities = component.detectorIds
      .map((detectorId) => DETECTOR_CAPABILITIES[detectorId])
      .filter((capability): capability is string => Boolean(capability));
    const packageFiles = unique([
      ...component.paths,
      ...component.evidenceIds
        .map((id) => evidenceById.get(id)?.path)
        .filter((file): file is string => Boolean(file)),
    ]).filter((file) => pathBelongsToPackage(file, workspacePackage.rootPath));
    const sourceEntryPoints = packageFiles
      .filter((file) => /(?:package\.json|\.[cm]?[jt]sx?|\.sql|\.prisma)$/.test(file))
      .sort((left, right) => entryPointScore(left) - entryPointScore(right) || left.localeCompare(right))
      .slice(0, 8);
    const internalDependencies = workspacePackage.internalDependencyIds.map((packageId) => {
      const dependency = workspacePackages.find((candidate) => candidate.id === packageId);
      return { packageId, name: dependency?.name, componentId: dependency?.componentId };
    });
    component.description = capabilities.length
      ? `${workspacePackage.name} workspace package. Detected capabilities: ${capabilities.join(", ")}.`
      : component.description;
    component.metadata = {
      ...component.metadata,
      packageRoot: workspacePackage.rootPath,
      sourceEntryPoints,
      internalDependencies,
    };
  }

  return [...composed.values()].filter((component) => !absorbedComponentIds.has(component.id));
}

function validateReferences(analysis: RepositoryAnalysis): void {
  const filePaths = new Set(analysis.inventory.files.map(({ path }) => path));
  const componentIds = new Set(analysis.components.map(({ id }) => id));
  const evidenceIds = new Set(analysis.evidence.map(({ id }) => id));
  const packageIds = new Set(analysis.workspacePackages.map(({ id }) => id));
  const flowIds = new Set(analysis.flows.map(({ id }) => id));

  const requireIds = (ids: string[], known: Set<string>, context: string) => {
    const missing = ids.filter((id) => !known.has(id));
    if (missing.length > 0) throw new Error(`${context} references unknown IDs: ${missing.join(", ")}`);
  };

  for (const evidence of analysis.evidence) requireIds([evidence.path], filePaths, evidence.id);
  for (const component of analysis.components) {
    requireIds(component.evidenceIds, evidenceIds, component.id);
  }
  for (const relationship of analysis.relationships) {
    requireIds([relationship.sourceComponentId, relationship.targetComponentId], componentIds, relationship.id);
    requireIds(relationship.evidenceIds, evidenceIds, relationship.id);
  }
  for (const flow of analysis.flows) {
    requireIds(flow.componentIds, componentIds, flow.id);
    requireIds(flow.evidenceIds, evidenceIds, flow.id);
    for (const step of flow.steps) {
      requireIds([step.componentId], componentIds, `${flow.id} step ${step.order}`);
      requireIds(step.evidenceIds, evidenceIds, `${flow.id} step ${step.order}`);
    }
  }
  for (const workspacePackage of analysis.workspacePackages) {
    requireIds([workspacePackage.manifestPath], filePaths, workspacePackage.id);
    requireIds(workspacePackage.internalDependencyIds, packageIds, workspacePackage.id);
    if (workspacePackage.componentId) requireIds([workspacePackage.componentId], componentIds, workspacePackage.id);
    requireIds(workspacePackage.evidenceIds, evidenceIds, workspacePackage.id);
  }
  for (const candidate of analysis.contributionCandidates) {
    requireIds(candidate.componentIds, componentIds, candidate.id);
    requireIds(candidate.evidenceIds, evidenceIds, candidate.id);
  }
  for (const category of analysis.categoryAnalyses) {
    requireIds(category.evidenceIds, evidenceIds, category.id);
  }
  for (const coverage of analysis.coverage) {
    if (coverage.subjectType === "file") requireIds([coverage.subjectId], filePaths, coverage.id);
    if (coverage.subjectType === "component") requireIds([coverage.subjectId], componentIds, coverage.id);
    if (coverage.subjectType === "flow") requireIds([coverage.subjectId], flowIds, coverage.id);
    if (coverage.subjectType === "package") requireIds([coverage.subjectId], packageIds, coverage.id);
  }
}

export async function runRepositoryDetectors(input: {
  root: string;
  inventory: RepositoryInventory;
  detectors: RepositoryDetector[];
  signal?: AbortSignal;
}): Promise<RepositoryAnalysis> {
  const detectorIds = input.detectors.map(({ id }) => id);
  if (new Set(detectorIds).size !== detectorIds.length) {
    throw new Error("Detector IDs must be unique");
  }

  const results = await Promise.all(
    input.detectors.map(async (detector): Promise<DetectorResult> => {
      const result = DetectorResultSchema.parse(
        await detector.detect({ root: input.root, inventory: input.inventory, signal: input.signal })
      );
      if (result.detectorId !== detector.id) {
        throw new Error(`Detector ${detector.id} returned result for ${result.detectorId}`);
      }
      return result;
    })
  );

  const evidence = uniqueById(results.flatMap((result) => result.evidence));
  const workspacePackages = uniqueById(results.flatMap((result) => result.workspacePackages));
  const detectorComponents = uniqueById(results.flatMap((result) => result.components));
  const analysis = RepositoryAnalysisSchema.parse({
    inventory: input.inventory,
    components: composeWorkspacePackages(detectorComponents, evidence, workspacePackages),
    evidence,
    relationships: uniqueById(results.flatMap(({ relationships }) => relationships)),
    coverage: uniqueById(results.flatMap(({ coverage }) => coverage)),
    flows: uniqueById(results.flatMap(({ flows }) => flows)),
    workspacePackages,
    contributionCandidates: uniqueById(
      results.flatMap(({ contributionCandidates }) => contributionCandidates)
    ),
    categoryAnalyses: uniqueById(results.flatMap(({ categoryAnalyses }) => categoryAnalyses)),
    detectorIds,
    warnings: [...new Set(results.flatMap(({ warnings }) => warnings))],
  });

  validateReferences(analysis);
  return analysis;
}
