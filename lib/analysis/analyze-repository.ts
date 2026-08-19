import type { RepoScan } from "../repository/scan-files";
import { createAnalysisSandbox, createDetectorAdapters, readInventoryTextFiles } from "./adapters";
import { buildRepositoryInventory } from "./inventory";
import { runRepositoryDetectors } from "./orchestrator";
import type { RepositoryAnalysis } from "./types";

export async function analyzeRepository(root: string, scan?: RepoScan): Promise<RepositoryAnalysis> {
  const inventory = await buildRepositoryInventory(root, scan);
  const readable = await readInventoryTextFiles(root, inventory);
  const sandbox = await createAnalysisSandbox(readable.files);
  try {
    return await runRepositoryDetectors({
      root: inventory.root,
      inventory,
      detectors: createDetectorAdapters({
        sandboxRoot: sandbox.root,
        files: readable.files,
        limitedPaths: readable.limitedPaths,
        readWarnings: readable.warnings,
      }),
    });
  } finally {
    await sandbox.cleanup();
  }
}
