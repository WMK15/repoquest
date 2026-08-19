import { z } from "zod";
import {
  AnalysisCoverageSchema,
  CategoryAnalysisSchema,
  CategoryAnalysisStatusSchema,
  ComponentSchema,
  ContributionCandidateSchema,
  CoverageStatusSchema,
  DetectorResultSchema,
  EvidenceSchema,
  FileCategorySchema,
  InventoryFileSchema,
  LineRangeSchema,
  RelationshipSchema,
  RepositoryAnalysisSchema,
  RepositoryInventorySchema,
  SystemFlowSchema,
  WorkspacePackageSchema,
} from "./contracts";

export type FileCategory = z.infer<typeof FileCategorySchema>;
export type InventoryFile = z.infer<typeof InventoryFileSchema>;
export type RepositoryInventory = z.infer<typeof RepositoryInventorySchema>;
export type LineRange = z.infer<typeof LineRangeSchema>;
export type Evidence = z.infer<typeof EvidenceSchema>;
export type Component = z.infer<typeof ComponentSchema>;
export type Relationship = z.infer<typeof RelationshipSchema>;
export type CoverageStatus = z.infer<typeof CoverageStatusSchema>;
export type AnalysisCoverage = z.infer<typeof AnalysisCoverageSchema>;
export type CategoryAnalysisStatus = z.infer<typeof CategoryAnalysisStatusSchema>;
export type CategoryAnalysis = z.infer<typeof CategoryAnalysisSchema>;
export type SystemFlow = z.infer<typeof SystemFlowSchema>;
export type WorkspacePackage = z.infer<typeof WorkspacePackageSchema>;
export type ContributionCandidate = z.infer<typeof ContributionCandidateSchema>;
export type DetectorResult = z.infer<typeof DetectorResultSchema>;
export type RepositoryAnalysis = z.infer<typeof RepositoryAnalysisSchema>;

/** Compatibility surface for content-based detectors that emit raw findings. */
export interface Detector {
  id: string;
  name: string;
  detect(context: {
    files: Array<{ path: string; content: string }>;
  }):
    | { detectorId: string; findings: unknown[] }
    | Promise<{ detectorId: string; findings: unknown[] }>;
}
