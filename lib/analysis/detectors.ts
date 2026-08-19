import type { RepositoryInventory, DetectorResult } from "./types";

export interface DetectorContext {
  root: string;
  inventory: RepositoryInventory;
  signal?: AbortSignal;
}

export interface RepositoryDetector {
  id: string;
  detect(context: DetectorContext): Promise<DetectorResult> | DetectorResult;
}
