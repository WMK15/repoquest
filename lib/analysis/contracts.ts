import { z } from "zod";

const IdentifierSchema = z.string().min(1);
const RepositoryPathSchema = z
  .string()
  .min(1)
  .refine((value) => !value.startsWith("/") && !value.split("/").includes(".."), {
    message: "Expected a repository-relative path",
  });

export const FileCategorySchema = z.enum([
  "typescript",
  "javascript",
  "sql",
  "documentation",
  "manifest",
  "config",
  "package",
  "docker",
  "terraform",
  "github-actions",
  "source",
  "test",
  "asset",
  "other",
]);

export const InventoryFileSchema = z.object({
  path: RepositoryPathSchema,
  category: FileCategorySchema,
  sizeBytes: z.number().int().nonnegative(),
  safeToRead: z.boolean(),
});

export const RepositoryInventorySchema = z.object({
  root: z.string().min(1),
  files: z.array(InventoryFileSchema),
  totalFiles: z.number().int().nonnegative(),
  categoryCounts: z.record(FileCategorySchema, z.number().int().nonnegative()),
});

export const LineRangeSchema = z
  .object({
    start: z.number().int().positive(),
    end: z.number().int().positive(),
  })
  .refine(({ start, end }) => end >= start, {
    message: "Line range end must be at or after start",
  });

export const EvidenceSchema = z.object({
  id: IdentifierSchema,
  path: RepositoryPathSchema,
  lines: LineRangeSchema,
  claim: z.string().min(1),
  excerpt: z.string().min(1).optional(),
  detectorId: IdentifierSchema.optional(),
});

export const ComponentSchema = z.object({
  id: IdentifierSchema,
  name: z.string().min(1),
  kind: z.enum([
    "application",
    "service",
    "library",
    "package",
    "database",
    "infrastructure",
    "documentation",
    "tooling",
    "other",
  ]),
  description: z.string().min(1),
  paths: z.array(RepositoryPathSchema),
  evidenceIds: z.array(IdentifierSchema),
  detectorIds: z.array(IdentifierSchema).default([]),
  confidence: z.enum(["high", "medium", "low"]).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const RelationshipSchema = z.object({
  id: IdentifierSchema,
  sourceComponentId: IdentifierSchema,
  targetComponentId: IdentifierSchema,
  kind: z.enum([
    "depends-on",
    "calls",
    "reads-from",
    "writes-to",
    "publishes",
    "subscribes",
    "contains",
    "deploys",
    "documents",
    "other",
  ]),
  description: z.string().min(1),
  evidenceIds: z.array(IdentifierSchema),
});

export const CoverageStatusSchema = z.enum([
  "not-analyzed",
  "partial",
  "complete",
  "failed",
]);

export const AnalysisCoverageSchema = z.object({
  id: IdentifierSchema,
  subjectType: z.enum(["repository", "file", "component", "flow", "package"]),
  subjectId: IdentifierSchema,
  status: CoverageStatusSchema,
  detectorIds: z.array(IdentifierSchema),
  notes: z.array(z.string().min(1)),
});

export const CategoryAnalysisStatusSchema = z.enum([
  "found",
  "not-detected",
  "uncertain",
  "unsupported",
  "analysis-limited",
]);

export const CategoryAnalysisSchema = z.object({
  id: IdentifierSchema,
  category: z.string().min(1),
  detectorId: IdentifierSchema,
  status: CategoryAnalysisStatusSchema,
  summary: z.string().min(1),
  evidenceIds: z.array(IdentifierSchema).default([]),
});

export const SystemFlowSchema = z.object({
  id: IdentifierSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  componentIds: z.array(IdentifierSchema),
  steps: z.array(
    z.object({
      order: z.number().int().positive(),
      componentId: IdentifierSchema,
      description: z.string().min(1),
      evidenceIds: z.array(IdentifierSchema),
    })
  ),
  evidenceIds: z.array(IdentifierSchema),
});

export const WorkspacePackageSchema = z.object({
  id: IdentifierSchema,
  name: z.string().min(1),
  rootPath: z.string(),
  manifestPath: RepositoryPathSchema,
  ecosystem: z.enum([
    "node",
    "python",
    "rust",
    "go",
    "java",
    "dotnet",
    "ruby",
    "php",
    "other",
  ]),
  componentId: IdentifierSchema.optional(),
  internalDependencyIds: z.array(IdentifierSchema),
  evidenceIds: z.array(IdentifierSchema),
});

export const ContributionCandidateSchema = z.object({
  id: IdentifierSchema,
  title: z.string().min(1),
  description: z.string().min(1),
  kind: z.enum(["bug", "documentation", "test", "refactor", "feature", "maintenance"]),
  difficulty: z.enum(["starter", "intermediate", "advanced"]),
  paths: z.array(RepositoryPathSchema),
  componentIds: z.array(IdentifierSchema),
  rationale: z.string().min(1),
  evidenceIds: z.array(IdentifierSchema),
});

export const DetectorResultSchema = z.object({
  detectorId: IdentifierSchema,
  components: z.array(ComponentSchema).default([]),
  evidence: z.array(EvidenceSchema).default([]),
  relationships: z.array(RelationshipSchema).default([]),
  coverage: z.array(AnalysisCoverageSchema).default([]),
  flows: z.array(SystemFlowSchema).default([]),
  workspacePackages: z.array(WorkspacePackageSchema).default([]),
  contributionCandidates: z.array(ContributionCandidateSchema).default([]),
  categoryAnalyses: z.array(CategoryAnalysisSchema).default([]),
  warnings: z.array(z.string().min(1)).default([]),
});

export const RepositoryAnalysisSchema = z.object({
  inventory: RepositoryInventorySchema,
  components: z.array(ComponentSchema),
  evidence: z.array(EvidenceSchema),
  relationships: z.array(RelationshipSchema),
  coverage: z.array(AnalysisCoverageSchema),
  flows: z.array(SystemFlowSchema),
  workspacePackages: z.array(WorkspacePackageSchema),
  contributionCandidates: z.array(ContributionCandidateSchema),
  categoryAnalyses: z.array(CategoryAnalysisSchema).default([]),
  detectorIds: z.array(IdentifierSchema),
  warnings: z.array(z.string().min(1)),
});
